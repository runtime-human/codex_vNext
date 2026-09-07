import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { skillPromptFixtures } from '../fixtures/skill-prompts.js';

const expectedSkills = [
  'orchestrate-work',
  'task-envelope',
  'verify-work',
  'workflow-status',
  'recover-work',
] as const;

function frontmatterValue(source: string, key: string): string | undefined {
  const line = source
    .split(/\r?\n/)
    .slice(1)
    .find((candidate) => candidate.startsWith(`${key}:`));
  return line?.slice(key.length + 1).trim();
}

describe('foundational skill contracts', () => {
  it('documents distinct positive and trivial-negative trigger fixtures', () => {
    expect(skillPromptFixtures).toHaveLength(8);
    expect(skillPromptFixtures[0]?.expected).toEqual([]);
    expect(skillPromptFixtures[1]?.expected).toEqual([]);
    expect(
      new Set(skillPromptFixtures.slice(2).flatMap(({ expected }) => expected)),
    ).toEqual(new Set(expectedSkills));
  });

  it('has unique names and descriptions within the compact line budget', async () => {
    const contracts = await Promise.all(
      expectedSkills.map(async (skill) => {
        const source = await readFile(
          path.join('skills', skill, 'SKILL.md'),
          'utf8',
        );
        return {
          name: frontmatterValue(source, 'name'),
          description: frontmatterValue(source, 'description'),
          nonEmptyLines: source.split(/\r?\n/).filter((line) => line.trim())
            .length,
        };
      }),
    );

    expect(contracts.map(({ name }) => name)).toEqual(expectedSkills);
    expect(new Set(contracts.map(({ description }) => description)).size).toBe(
      5,
    );
    expect(contracts.every(({ description }) => Boolean(description))).toBe(
      true,
    );
    expect(contracts.every(({ nonEmptyLines }) => nonEmptyLines <= 120)).toBe(
      true,
    );
  });
});
