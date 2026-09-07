import type { DatabaseSync } from 'node:sqlite';

export function withImmediateTransaction<T>(
  db: DatabaseSync,
  action: () => T,
): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    if (
      typeof result === 'object' &&
      result !== null &&
      'then' in result &&
      typeof (result as { then?: unknown }).then === 'function'
    ) {
      throw new Error('write transaction callback must be synchronous');
    }
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
