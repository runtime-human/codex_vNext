import { DatabaseSync } from 'node:sqlite';

import { StateError } from './errors.js';
import { resolveStorageRoot, type StorageRoot } from './storage-root.js';

function pragmaValue(
  db: DatabaseSync,
  pragma: string,
  column: string,
): unknown {
  return (
    db.prepare(`PRAGMA ${pragma}`).get() as Record<string, unknown> | undefined
  )?.[column];
}

export function openWorkflowDatabase(
  storage: StorageRoot = resolveStorageRoot(),
): DatabaseSync {
  const db = new DatabaseSync(storage.databasePath, {
    timeout: 5_000,
    defensive: true,
    allowExtension: false,
  });

  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA trusted_schema = OFF;
      PRAGMA busy_timeout = 5000;
    `);

    const actual = {
      foreignKeys: pragmaValue(db, 'foreign_keys', 'foreign_keys'),
      journalMode: pragmaValue(db, 'journal_mode', 'journal_mode'),
      synchronous: pragmaValue(db, 'synchronous', 'synchronous'),
      quickCheck: pragmaValue(db, 'quick_check', 'quick_check'),
    };
    if (
      actual.foreignKeys !== 1 ||
      actual.journalMode !== 'wal' ||
      actual.synchronous !== 2 ||
      actual.quickCheck !== 'ok'
    ) {
      throw new StateError(
        'INTEGRITY_FAILED',
        'SQLite safety checks failed',
        actual,
      );
    }

    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
