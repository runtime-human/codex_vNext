import { serveStdio } from '@modelcontextprotocol/server/stdio';

import {
  buildRuntimeFromEnvironment,
  buildWorkflowNextMcpServer,
} from './server.js';

const runtime = await buildRuntimeFromEnvironment();
serveStdio(() => buildWorkflowNextMcpServer(runtime), {
  onerror: (error) => console.error(error.message),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    runtime.close();
    process.exit(0);
  });
}
