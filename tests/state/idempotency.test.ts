import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalJson,
  executeIdempotent,
  hashMutationRequest,
  migrateDatabase,
  openWorkflowDatabase,
  redactSensitiveText,
  resolveStorageRoot,
  type StorageRoot,
} from '../../src/state/index.js';

let pluginData: string;
let storage: StorageRoot;
let db: DatabaseSync;
const fixedClock = { nowIso: () => '2026-09-08T00:00:00Z' };

beforeEach(async () => {
  pluginData = await mkdtemp(path.join(tmpdir(), 'workflow-next-idempotency-'));
  storage = resolveStorageRoot(pluginData);
  db = openWorkflowDatabase(storage);
  await migrateDatabase(db, storage);
  db.exec(`
    INSERT INTO projects (
      project_id, repo_root, repo_key, repo_fingerprint, created_at, updated_at, version
    ) VALUES ('project-1', '/repo', 'key', 'fingerprint', '2026-09-08T00:00:00Z', '2026-09-08T00:00:00Z', 1);
    INSERT INTO runs (
      run_id, project_id, objective, state, durable, started_at, updated_at, version
    ) VALUES ('run-1', 'project-1', 'test', 'active', 0, '2026-09-08T00:00:00Z', '2026-09-08T00:00:00Z', 1);
    CREATE TABLE effects (value TEXT) STRICT;
  `);
});

afterEach(async () => {
  if (db.isOpen) db.close();
  await rm(pluginData, { recursive: true });
});

describe('canonical mutation input', () => {
  it('sorts object keys while preserving array order', () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}',
    );
    expect(hashMutationRequest('work.update', { a: 1, b: 2 })).toBe(
      hashMutationRequest('work.update', { b: 2, a: 1 }),
    );
    expect(hashMutationRequest('work.update', { values: [1, 2] })).not.toBe(
      hashMutationRequest('work.update', { values: [2, 1] }),
    );
  });

  it('uses code-point ordering for non-ASCII idempotency keys', () => {
    const first = { z: 1, ä: 2, a: 3 };
    const second = { a: 3, ä: 2, z: 1 };

    expect(canonicalJson(first)).toBe('{"a":3,"z":1,"ä":2}');
    expect(hashMutationRequest('work.update', first)).toBe(
      hashMutationRequest('work.update', second),
    );
  });
});

describe('secret redaction', () => {
  it.each([
    ['Authorization: Bearer auth-secret', 'auth-secret'],
    ['Authorization: Basic basic-secret', 'basic-secret'],
    ['Authorization: Bearer "quoted-auth-secret"', 'quoted-auth-secret'],
    ["Authorization: Basic 'quoted-basic-secret'", 'quoted-basic-secret'],
    ['Bearer bearer-secret', 'bearer-secret'],
    ['--token flag-secret', 'flag-secret'],
    ['--access-token access-flag-secret', 'access-flag-secret'],
    ['{"token":"json-secret"}', 'json-secret'],
    ['X-Api-Key: header-secret', 'header-secret'],
    ['client_secret=client-secret', 'client-secret'],
    ['access_token=query-secret', 'query-secret'],
    ['token=token-secret', 'token-secret'],
    ['api_key=api-secret', 'api-secret'],
    ['apikey=apikey-secret', 'apikey-secret'],
    ['password=password-secret', 'password-secret'],
    ['secret=plain-secret', 'plain-secret'],
    ['github_pat_patsecret', 'github_pat_patsecret'],
    ['ghp_ghsecret', 'ghp_ghsecret'],
    ['sk-sksecret', 'sk-sksecret'],
    ['https://user:uri-secret@example.com/repo', 'uri-secret'],
  ])('removes secret material from %s', (input, secret) => {
    const redacted = redactSensitiveText(input);
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain(secret);
  });

  it('preserves ordinary text and non-secret URI query values', () => {
    const input = 'status=pass https://example.com/report?filter=visible';
    expect(redactSensitiveText(input)).toBe(input);
  });
});

describe('idempotent mutation execution', () => {
  const run = (
    commandId: string,
    toolName: string,
    normalizedInput: unknown,
    value = 'applied',
  ) =>
    executeIdempotent({
      db,
      toolName,
      commandId,
      runId: 'run-1',
      normalizedInput,
      clock: fixedClock,
      mutate: () => {
        db.prepare('INSERT INTO effects (value) VALUES (?)').run(value);
        db.prepare(`
          INSERT INTO workflow_events (
            event_id, run_id, entity_type, entity_id, event_type, payload_json,
            command_id, created_at
          ) VALUES (?, 'run-1', 'run', 'run-1', 'tested', '{}', ?, '2026-09-08T00:00:00Z')
        `).run(`event-${value}`, commandId);
        return { value };
      },
    });

  it('applies once and returns the stored result for equivalent input', () => {
    expect(run('command-1', 'work.update', { a: 1, b: 2 })).toEqual({
      value: 'applied',
    });
    expect(
      run('command-1', 'work.update', { b: 2, a: 1 }, 'duplicate'),
    ).toEqual({
      value: 'applied',
    });
    expect(db.prepare('SELECT value FROM effects').all()).toEqual([
      { value: 'applied' },
    ]);
    expect(
      db.prepare('SELECT count(*) AS count FROM command_receipts').get(),
    ).toEqual({
      count: 1,
    });
  });

  it('reuses a receipt for reordered non-ASCII fields', () => {
    expect(run('command-unicode', 'work.update', { z: 1, ä: 2, a: 3 })).toEqual(
      { value: 'applied' },
    );
    expect(
      run('command-unicode', 'work.update', { a: 3, ä: 2, z: 1 }, 'duplicate'),
    ).toEqual({ value: 'applied' });
    expect(db.prepare('SELECT count(*) AS count FROM effects').get()).toEqual({
      count: 1,
    });
  });

  it('rejects reuse with a different payload or tool', () => {
    run('command-2', 'work.update', { value: 1 }, 'first');
    expect(() =>
      run('command-2', 'work.update', { value: 2 }, 'second'),
    ).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
    expect(() =>
      run('command-2', 'work.transition', { value: 1 }, 'third'),
    ).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
  });

  it('rolls projection, event and receipt back together on failure', () => {
    expect(() =>
      executeIdempotent({
        db,
        toolName: 'work.update',
        commandId: 'command-3',
        runId: 'run-1',
        normalizedInput: { value: 'bad' },
        clock: fixedClock,
        mutate: () => {
          db.prepare('INSERT INTO effects (value) VALUES (?)').run('discarded');
          db.prepare(`
            INSERT INTO workflow_events (
              event_id, run_id, entity_type, entity_id, event_type, payload_json,
              command_id, created_at
            ) VALUES ('event-bad', 'run-1', 'run', 'run-1', 'tested', '{}',
              'command-3', '2026-09-08T00:00:00Z')
          `).run();
          throw new Error('sentinel');
        },
      }),
    ).toThrow('sentinel');
    expect(db.prepare('SELECT count(*) AS count FROM effects').get()).toEqual({
      count: 0,
    });
    expect(
      db.prepare('SELECT count(*) AS count FROM workflow_events').get(),
    ).toEqual({
      count: 0,
    });
    expect(
      db.prepare('SELECT count(*) AS count FROM command_receipts').get(),
    ).toEqual({
      count: 0,
    });
  });
});
