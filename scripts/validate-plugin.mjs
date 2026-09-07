import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, '.codex-plugin', 'plugin.json');

function fail(message) {
  console.error(`plugin validation failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(manifestPath)) fail('.codex-plugin/plugin.json is missing');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const key of ['name', 'version', 'description', 'skills']) {
  if (typeof manifest[key] !== 'string' || manifest[key].length === 0) {
    fail(`manifest field ${key} must be a non-empty string`);
  }
}

for (const forbidden of ['hooks', 'mcp', 'apps']) {
  if (forbidden in manifest) fail(`PH-01 must not declare ${forbidden}`);
}

const skillsRoot = path.resolve(root, manifest.skills);
if (!skillsRoot.startsWith(root)) fail('skills path escapes repository root');
if (!fs.existsSync(skillsRoot)) fail('skills directory is missing');

const expectedSkills = ['orchestrate-work', 'task-envelope', 'verify-work'];
for (const skill of expectedSkills) {
  const skillFile = path.join(skillsRoot, skill, 'SKILL.md');
  if (!fs.existsSync(skillFile)) fail(`missing skill ${skill}`);
}

console.log('plugin validation passed');
