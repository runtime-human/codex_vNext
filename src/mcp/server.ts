import type { DatabaseSync } from 'node:sqlite';
import { McpServer } from '@modelcontextprotocol/server';

import {
  migrateDatabase,
  openWorkflowDatabase,
  RunResourceJournal,
  resolveStorageRoot,
  StateService,
} from '../state/index.js';
import { type RuntimeDependencies, registerWorkflowTools } from './tools.js';

export const packageVersion = '0.1.0-alpha.1';

export interface WorkflowRuntime extends RuntimeDependencies {
  db: DatabaseSync;
  close(): void;
}

export async function buildRuntimeFromEnvironment(): Promise<WorkflowRuntime> {
  const storage = resolveStorageRoot();
  const db = openWorkflowDatabase(storage);
  try {
    await migrateDatabase(db, storage);
    return {
      db,
      service: new StateService({ db }),
      resources: new RunResourceJournal({ db }),
      close: () => db.close(),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

export function buildWorkflowNextMcpServer(
  dependencies: RuntimeDependencies,
): McpServer {
  const server = new McpServer({
    name: 'workflow-next',
    version: packageVersion,
  });
  registerWorkflowTools(server, dependencies);
  return server;
}
