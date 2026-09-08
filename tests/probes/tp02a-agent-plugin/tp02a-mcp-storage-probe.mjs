import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const TOOL_NAME = 'tp02a.storage_probe';
const NONCE_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const DATABASE_NAME = 'probe.sqlite3';

function isWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function assertWithin(base, candidate, description) {
  if (!isWithin(base, candidate))
    throw new Error(`${description} escaped PLUGIN_DATA`);
}

function lstatIfPresent(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

function probeRoot() {
  const pluginData = process.env.PLUGIN_DATA;
  if (!pluginData) throw new Error('PLUGIN_DATA is not set');
  const root = path.resolve(pluginData);
  fs.mkdirSync(root, { recursive: true });
  const rootStat = fs.lstatSync(root);
  if (rootStat.isSymbolicLink())
    throw new Error('PLUGIN_DATA must not be a symlink or junction');
  if (!rootStat.isDirectory())
    throw new Error('PLUGIN_DATA is not a directory');
  const rootReal = fs.realpathSync.native(root);
  const probe = path.join(root, 'tp02a');
  assertWithin(root, probe, 'probe path');
  const probeStat = lstatIfPresent(probe);
  if (probeStat) {
    if (probeStat.isSymbolicLink())
      throw new Error('probe path must not be a symlink or junction');
    if (!probeStat.isDirectory())
      throw new Error('probe path is not a directory');
  } else {
    fs.mkdirSync(probe);
  }
  const probeReal = fs.realpathSync.native(probe);
  assertWithin(rootReal, probeReal, 'probe path');
  return { probe, probeReal, rootReal };
}

function validateNonce(nonce) {
  if (typeof nonce !== 'string' || !NONCE_PATTERN.test(nonce))
    throw new Error('invalid nonce');
  return nonce;
}

function noncePath(root, nonce) {
  validateNonce(nonce);
  return path.join(root, `${nonce}.verified`);
}

function nonceTemporaryPath(root, nonce) {
  validateNonce(nonce);
  return path.join(root, `${nonce}.tmp`);
}

function databasePath(root) {
  return path.join(root, DATABASE_NAME);
}

function validateProbeFile(probe, target, description, allowMissing = false) {
  const resolved = path.resolve(target);
  assertWithin(probe.probe, resolved, description);
  const stat = lstatIfPresent(resolved);
  if (!stat) {
    if (!allowMissing) throw new Error(`${description} is missing`);
    return undefined;
  }
  if (stat.isSymbolicLink())
    throw new Error(`${description} must not be a symlink or junction`);
  if (!stat.isFile()) throw new Error(`${description} is not a regular file`);
  assertWithin(probe.rootReal, fs.realpathSync.native(resolved), description);
  return stat;
}

function openProbeDatabase(database) {
  return new DatabaseSync(database, {
    timeout: 5_000,
    defensive: true,
    allowExtension: false,
  });
}

function assertFilePersisted(probe, nonce) {
  const target = noncePath(probe.probe, nonce);
  validateProbeFile(probe, target, 'nonce file');
  if (fs.readFileSync(target, 'utf8') !== `${nonce}\n${nonce}\n`)
    throw new Error('file readback failed');
}

function assertSqlitePersisted(probe, nonce) {
  const target = databasePath(probe.probe);
  validateProbeFile(probe, target, 'probe database');
  const db = openProbeDatabase(target);
  try {
    if (
      db.prepare('SELECT nonce FROM probe WHERE nonce = ?').get(nonce)
        ?.nonce !== nonce
    )
      throw new Error('SQLite readback failed');
  } finally {
    db.close();
  }
}

function write(nonce) {
  validateNonce(nonce);
  const probe = probeRoot();
  const initial = nonceTemporaryPath(probe.probe, nonce);
  const renamed = noncePath(probe.probe, nonce);
  validateProbeFile(probe, initial, 'nonce temporary file', true);
  validateProbeFile(probe, renamed, 'nonce file', true);
  fs.writeFileSync(initial, `${nonce}\n`, { flag: 'wx' });
  fs.appendFileSync(initial, `${nonce}\n`);
  fs.renameSync(initial, renamed);
  assertFilePersisted(probe, nonce);

  const target = databasePath(probe.probe);
  validateProbeFile(probe, target, 'probe database', true);
  const db = openProbeDatabase(target);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('CREATE TABLE IF NOT EXISTS probe (nonce TEXT PRIMARY KEY) STRICT');
    db.prepare('INSERT OR REPLACE INTO probe (nonce) VALUES (?)').run(nonce);
    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }

  assertSqlitePersisted(probe, nonce);
  return {
    pluginDataPresent: true,
    create: 'pass',
    append: 'pass',
    rename: 'pass',
    read: 'pass',
    sqliteTransaction: 'pass',
    sqliteReopen: 'pass',
  };
}

function verify(nonce) {
  validateNonce(nonce);
  const probe = probeRoot();
  assertFilePersisted(probe, nonce);
  assertSqlitePersisted(probe, nonce);
  return { pluginDataPresent: true, restartPersistence: 'pass' };
}

function cleanup(nonce) {
  validateNonce(nonce);
  const probe = probeRoot();
  const database = databasePath(probe.probe);
  const ownedFiles = [
    nonceTemporaryPath(probe.probe, nonce),
    noncePath(probe.probe, nonce),
    database,
    `${database}-wal`,
    `${database}-shm`,
  ];
  for (const target of ownedFiles)
    validateProbeFile(probe, target, 'probe-owned file', true);
  for (const target of ownedFiles) {
    if (lstatIfPresent(target)) fs.unlinkSync(target);
  }
  return { pluginDataPresent: true, cleanup: 'pass' };
}

function execute(args) {
  if (
    !args ||
    typeof args !== 'object' ||
    typeof args.mode !== 'string' ||
    typeof args.nonce !== 'string'
  ) {
    throw new Error('mode and nonce are required');
  }
  if (args.mode === 'write') return write(args.nonce);
  if (args.mode === 'verify') return verify(args.nonce);
  if (args.mode === 'cleanup') return cleanup(args.nonce);
  throw new Error('unsupported mode');
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({
    jsonrpc: '2.0',
    id,
    result: {
      structuredContent: value,
      content: [{ type: 'text', text: JSON.stringify(value) }],
    },
  });
}

let buffered = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffered += chunk;
  for (;;) {
    const newline = buffered.indexOf('\n');
    if (newline < 0) break;
    const line = buffered.slice(0, newline).replace(/\r$/, '');
    buffered = buffered.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: message.params?.protocolVersion ?? '2025-11-25',
          capabilities: { tools: {} },
          serverInfo: { name: 'workflow-next-tp02a', version: '1.0.0' },
        },
      });
    } else if (message.method === 'ping') {
      send({ jsonrpc: '2.0', id: message.id, result: {} });
    } else if (message.method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: TOOL_NAME,
              description:
                'Probe persistent PLUGIN_DATA file and SQLite storage.',
              inputSchema: {
                type: 'object',
                additionalProperties: false,
                required: ['mode', 'nonce'],
                properties: {
                  mode: { enum: ['write', 'verify', 'cleanup'] },
                  nonce: {
                    type: 'string',
                    pattern: '^[A-Za-z0-9_-]{1,160}$',
                    minLength: 1,
                    maxLength: 160,
                  },
                },
              },
            },
          ],
        },
      });
    } else if (message.method === 'tools/call') {
      try {
        if (message.params?.name !== TOOL_NAME) throw new Error('unknown tool');
        result(message.id, execute(message.params.arguments));
      } catch (error) {
        const value = {
          pluginDataPresent: Boolean(process.env.PLUGIN_DATA),
          error: String(error.message ?? error),
        };
        send({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            isError: true,
            structuredContent: value,
            content: [{ type: 'text', text: JSON.stringify(value) }],
          },
        });
      }
    } else if (message.id !== undefined) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'Method not found' },
      });
    }
  }
});
