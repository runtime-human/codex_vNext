import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'plugin.json');
const mcpPath = path.join(root, 'mcp.json');

function fail(message) {
  console.error(`plugin validation failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(manifestPath)) fail('plugin.json is missing');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const key of ['$schema', 'name', 'version', 'description']) {
  if (typeof manifest[key] !== 'string' || manifest[key].length === 0) {
    fail(`manifest field ${key} must be a non-empty string`);
  }
}

const skillsRoot = path.resolve(root, 'skills');
if (!fs.existsSync(skillsRoot)) fail('skills directory is missing');

const expectedSkills = [
  'orchestrate-work',
  'task-envelope',
  'verify-work',
  'workflow-status',
  'recover-work',
];
for (const skill of expectedSkills) {
  const skillFile = path.join(skillsRoot, skill, 'SKILL.md');
  if (!fs.existsSync(skillFile)) fail(`missing skill ${skill}`);
}

if (!fs.existsSync(mcpPath)) fail('mcp.json is missing');
const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
const server = mcp.mcpServers?.['workflow-next'];
if (
  mcp.$schema !== 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json' ||
  server?.type !== 'stdio' ||
  server.command !== 'node' ||
  server.cwd !== './' ||
  server.startup_timeout_sec !== undefined
) {
  fail('mcp.json does not match Agent Plugins v1 stdio contract');
}
if (JSON.stringify(server.args) !== JSON.stringify(['./dist/mcp/index.js'])) {
  fail('workflow-next MCP entry point is invalid');
}

console.log('plugin validation passed');
