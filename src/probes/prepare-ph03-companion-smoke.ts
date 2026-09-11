import {
  CompanionHydrationCapsuleSchema,
  type CompanionHydrationCapsule,
} from '../domain/context.js';

export interface Ph03CompanionSmokePreparationInput {
  runtimeCommit: string;
  codexVersion: string;
  hostSurface: 'cli' | 'desktop';
  parentOnlyMarker: string;
  hydrationCapsule: unknown;
}

export interface Ph03CompanionSmokeParentArtifact {
  packetVersion: 1;
  phase: 'PH-03';
  probe: 'companion_live_smoke';
  runtimeCommit: string;
  codexVersion: string;
  hostSurface: 'cli' | 'desktop';
  parentOnlyMarker: string;
  launch: {
    role: 'context_companion';
    forkTurns: 'none';
    authority: 'read_only';
  };
}

export interface Ph03CompanionSmokeWorkerArtifact {
  task: string;
  hydrationCapsule: CompanionHydrationCapsule;
}

export interface Ph03CompanionSmokeEvidenceTemplate {
  smokeVersion: 1;
  phase: 'PH-03';
  probe: 'companion_live_smoke';
  observedAt: null;
  runtimeCommit: string;
  codexVersion: string;
  hostSurface: 'cli' | 'desktop';
  worker: {
    role: 'context_companion';
    forkTurns: 'none';
    authority: 'read_only';
    freshThreadObserved: null;
    parentMarkerVisible: null;
    repoWritesObserved: null;
  };
  handoff: {
    hydrationCapsuleValidated: true;
    onlyHydrationCapsuleAndTaskPassed: null;
    contextDeltaValidated: null;
    contextDeltaItemCount: null;
    contextDeltaBytes: null;
    mainPersistedThroughContextIngestDelta: null;
  };
}

export interface Ph03CompanionSmokeArtifacts {
  parent: Ph03CompanionSmokeParentArtifact;
  worker: Ph03CompanionSmokeWorkerArtifact;
  evidenceTemplate: Ph03CompanionSmokeEvidenceTemplate;
}

function normalizeRuntimeCommit(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(normalized)) {
    throw new Error('runtimeCommit must be a full 40-character Git SHA');
  }
  return normalized;
}

function normalizeCodexVersion(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new Error('codexVersion must be a non-empty bounded string');
  }
  return normalized;
}

function normalizeParentOnlyMarker(value: string): string {
  const normalized = value.trim();
  if (!/^PH03_PARENT_ONLY_[A-Za-z0-9_-]{8,128}$/u.test(normalized)) {
    throw new Error(
      'parentOnlyMarker must use PH03_PARENT_ONLY_ plus 8-128 safe characters',
    );
  }
  return normalized;
}

export function createPh03CompanionSmokeArtifacts(
  input: Ph03CompanionSmokePreparationInput,
): Ph03CompanionSmokeArtifacts {
  const runtimeCommit = normalizeRuntimeCommit(input.runtimeCommit);
  const codexVersion = normalizeCodexVersion(input.codexVersion);
  const parentOnlyMarker = normalizeParentOnlyMarker(input.parentOnlyMarker);
  const hydrationCapsule = CompanionHydrationCapsuleSchema.parse(
    input.hydrationCapsule,
  );

  if (JSON.stringify(hydrationCapsule).includes(parentOnlyMarker)) {
    throw new Error(
      'parent-only marker must not already exist in the hydration capsule',
    );
  }

  const parent: Ph03CompanionSmokeParentArtifact = {
    packetVersion: 1,
    phase: 'PH-03',
    probe: 'companion_live_smoke',
    runtimeCommit,
    codexVersion,
    hostSurface: input.hostSurface,
    parentOnlyMarker,
    launch: {
      role: 'context_companion',
      forkTurns: 'none',
      authority: 'read_only',
    },
  };

  const worker: Ph03CompanionSmokeWorkerArtifact = {
    task: [
      'Use only the supplied hydration capsule as task context.',
      `Return one JSON ContextDelta for taskId ${JSON.stringify(hydrationCapsule.taskId)} and no prose outside that JSON value.`,
      'Do not write to the repository.',
      'If inherited context exposes any exact token beginning with PH03_PARENT_ONLY_, copy that exact token into unresolvedQuestions; otherwise do not invent or echo such a token.',
    ].join(' '),
    hydrationCapsule,
  };

  if (JSON.stringify(worker).includes(parentOnlyMarker)) {
    throw new Error('parent-only marker leaked into the worker handoff');
  }

  const evidenceTemplate: Ph03CompanionSmokeEvidenceTemplate = {
    smokeVersion: 1,
    phase: 'PH-03',
    probe: 'companion_live_smoke',
    observedAt: null,
    runtimeCommit,
    codexVersion,
    hostSurface: input.hostSurface,
    worker: {
      role: 'context_companion',
      forkTurns: 'none',
      authority: 'read_only',
      freshThreadObserved: null,
      parentMarkerVisible: null,
      repoWritesObserved: null,
    },
    handoff: {
      hydrationCapsuleValidated: true,
      onlyHydrationCapsuleAndTaskPassed: null,
      contextDeltaValidated: null,
      contextDeltaItemCount: null,
      contextDeltaBytes: null,
      mainPersistedThroughContextIngestDelta: null,
    },
  };

  return { parent, worker, evidenceTemplate };
}
