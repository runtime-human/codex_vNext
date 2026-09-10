import type { DatabaseSync } from 'node:sqlite';
import { McpServer } from '@modelcontextprotocol/server';

import { ContextIndexService } from '../context/context-index-service.js';
import { ContextSourceResolver } from '../context/source-resolver.js';
import {
  ContextRepository,
  migrateDatabase,
  openWorkflowDatabase,
  RunResourceJournal,
  resolveStorageRoot,
  StateRepositories,
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
    const repositories = new StateRepositories(db);
    const context = new ContextIndexService({
      contexts: new ContextRepository(db),
      repositories,
      sourceResolver: new ContextSourceResolver({ repositories }),
    });
    return {
      db,
      service: new StateService({ db, repositories }),
      resources: new RunResourceJournal({ db, repositories }),
      context,
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
