export const skillPromptFixtures = [
  { prompt: 'Fix the typo in README line 4', expected: [] },
  { prompt: 'Search the web for the latest MCP spec.', expected: [] },
  {
    prompt: 'Decide whether this refactor should be delegated and verified',
    expected: ['orchestrate-work'],
  },
  {
    prompt:
      'Prepare a bounded assignment for a fresh executor to change auth validation',
    expected: ['task-envelope'],
  },
  {
    prompt: 'Verify whether this migration is actually safe for production',
    expected: ['verify-work'],
  },
  {
    prompt: 'What state does Workflow Next currently have for this repo?',
    expected: ['workflow-status'],
  },
  {
    prompt: 'Recover the workflow from the last saved state after the restart.',
    expected: ['recover-work'],
  },
  {
    prompt: 'Where did we stop and what is the next safe action?',
    expected: ['workflow-status', 'recover-work'],
  },
] as const;
