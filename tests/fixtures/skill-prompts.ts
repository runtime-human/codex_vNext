export const skillPromptFixtures = [
  { prompt: 'Fix the typo in README line 4', expected: [] },
  {
    prompt: 'Decide whether this refactor should be delegated and verified',
    expected: ['orchestrate-work'],
  },
  {
    prompt:
      'Prepare a bounded assignment for a fresh builder to change auth validation',
    expected: ['task-envelope'],
  },
  {
    prompt: 'Verify whether this migration is actually safe for production',
    expected: ['verify-work'],
  },
] as const;
