import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

interface CompanionEvidence {
  phase: 'PH-03';
  status: 'PASS' | 'PARTIAL';
  pluginPackageCommit: string;
  environment: {
    surface: string | null;
    codexBuild: string | null;
  };
  observations: {
    forkTurnsNone: 'pass' | 'unobserved';
    parentMarkerIsolation: 'pass' | 'unobserved';
    schemaValidDelta: 'pass' | 'unobserved';
    noRepositoryWrites: 'pass' | 'unobserved';
  };
  limitations?: string[];
}

async function loadEvidence(): Promise<CompanionEvidence> {
  return JSON.parse(
    await readFile('evidence/ph03-companion-smoke.json', 'utf8'),
  ) as CompanionEvidence;
}

describe('PH-03 live Companion evidence', () => {
  it('never represents an unobserved native smoke as PASS', async () => {
    const evidence = await loadEvidence();

    expect(evidence.phase).toBe('PH-03');
    expect(evidence.pluginPackageCommit).toMatch(/^[a-f0-9]{40}$/u);

    if (evidence.status === 'PASS') {
      expect(evidence.environment.surface).toMatch(/Desktop|CLI/u);
      expect(evidence.environment.codexBuild).toBeTruthy();
      expect(evidence.observations).toEqual({
        forkTurnsNone: 'pass',
        parentMarkerIsolation: 'pass',
        schemaValidDelta: 'pass',
        noRepositoryWrites: 'pass',
      });
      return;
    }

    expect(evidence.status).toBe('PARTIAL');
    expect(evidence.limitations?.length).toBeGreaterThan(0);
    expect(Object.values(evidence.observations)).toContain('unobserved');
  });
});
