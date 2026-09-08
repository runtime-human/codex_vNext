import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'plugin.json');
const mcpPath = path.join(root, 'mcp.json');
const legacyManifestPath = path.join(root, '.codex-plugin', 'plugin.json');

function fail(message) {
  console.error(`plugin validation failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(manifestPath)) fail('plugin.json is missing');
if (fs.existsSync(legacyManifestPath)) {
  fail(
    'legacy .codex-plugin/plugin.json must not coexist with Agent Plugins v1',
  );
}

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
const mcpEntrypoint = path.resolve(root, server.args[0]);
if (!fs.existsSync(mcpEntrypoint)) {
  fail('workflow-next MCP entry point has not been built');
}
const mcpEntrypointStats = fs.lstatSync(mcpEntrypoint);
if (mcpEntrypointStats.isSymbolicLink() || !mcpEntrypointStats.isFile()) {
  fail('workflow-next MCP entry point must be a regular package file');
}
const resolvedEntrypoint = fs.realpathSync(mcpEntrypoint);
const entrypointRelative = path.relative(root, resolvedEntrypoint);
if (
  entrypointRelative === '..' ||
  entrypointRelative.startsWith(`..${path.sep}`) ||
  path.isAbsolute(entrypointRelative)
) {
  fail('workflow-next MCP entry point escapes the package root');
}

console.log('plugin validation passed');
