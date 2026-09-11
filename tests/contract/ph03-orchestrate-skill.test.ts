import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('PH-03 orchestrate-work Companion handoff', () => {
  it('documents an explicit optional fresh hydration/delta path without PH-04 routing', async () => {
    const source = await readFile('skills/orchestrate-work/SKILL.md', 'utf8');

    expect(source).toContain('context.hydrate');
    expect(source).toContain('fork_turns="none"');
    expect(source).toContain('ContextDelta');
    expect(source).toContain('context.ingest_delta');
    expect(source).toContain('Companion remains optional');
    expect(source).toContain('Main decides whether the handoff is useful');
    expect(source).not.toContain('automatically route to `context_companion`');
    expect(source).not.toContain('Companion is mandatory');
  });
});
