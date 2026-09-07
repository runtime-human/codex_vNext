import type { DatabaseSync } from 'node:sqlite';

import { canonicalJson, hashMutationRequest } from './canonical-json.js';
import { type Clock, systemClock } from './clock.js';
import { StateError } from './errors.js';
import { withImmediateTransaction } from './transaction.js';

export interface IdempotentMutationOptions<T> {
  db: DatabaseSync;
  toolName: string;
  commandId: string;
  runId?: string;
  normalizedInput: unknown;
  mutate: () => T;
  clock?: Clock;
}

export function executeIdempotent<T>({
  db,
  toolName,
  commandId,
  runId,
  normalizedInput,
  mutate,
  clock = systemClock,
}: IdempotentMutationOptions<T>): T {
  const requestHash = hashMutationRequest(toolName, normalizedInput);

  return withImmediateTransaction(db, () => {
    const receipt = db
      .prepare(
        'SELECT tool_name, request_hash, result_json FROM command_receipts WHERE command_id = ?',
      )
      .get(commandId) as
      | { tool_name: string; request_hash: string; result_json: string }
      | undefined;

    if (receipt) {
      if (
        receipt.tool_name !== toolName ||
        receipt.request_hash !== requestHash
      ) {
        throw new StateError(
          'IDEMPOTENCY_CONFLICT',
          'commandId was already used for a different mutation',
          { commandId },
        );
      }
      return JSON.parse(receipt.result_json) as T;
    }

    const result = mutate();
    const resultJson = canonicalJson(result);
    db.prepare(`
      INSERT INTO command_receipts (
        command_id, tool_name, request_hash, run_id, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      commandId,
      toolName,
      requestHash,
      runId ?? null,
      resultJson,
      clock.nowIso(),
    );
    return result;
  });
}
