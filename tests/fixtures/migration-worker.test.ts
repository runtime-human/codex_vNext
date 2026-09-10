import { describe, expect, it } from 'vitest';
import {
  currentSchemaVersion,
  migrateDatabase,
  openWorkflowDatabase,
  resolveStorageRoot,
} from '../../src/state/index.js';

describe.runIf(Boolean(process.env.MIGRATION_WORKER_ROOT))(
  'migration worker',
  () => {
    it('applies the current schema', async () => {
      const storage = resolveStorageRoot(process.env.MIGRATION_WORKER_ROOT);
      const db = openWorkflowDatabase(storage);
      try {
        await migrateDatabase(db, storage);
        expect(currentSchemaVersion(db)).toBe(2);
      } finally {
        db.close();
      }
    });
  },
);
