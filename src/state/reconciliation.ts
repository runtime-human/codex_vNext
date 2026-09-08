import type { InspectedProject } from './project-inspector.js';
import type {
  ProjectRecord,
  RunRecord,
  StateRepositories,
} from './repositories.js';

export type RepoDrift =
  | 'none'
  | 'head_changed'
  | 'project_identity_changed'
  | 'git_unavailable';

const PROJECTION_LIMIT = 100;

export function classifyRepoDrift(
  project: ProjectRecord,
  run: RunRecord,
  inspection: InspectedProject,
): RepoDrift {
  if (!inspection.gitAvailable) return 'git_unavailable';
  if (inspection.repoFingerprint !== project.repoFingerprint)
    return 'project_identity_changed';
  if (run.lastObservedRepoHead && inspection.head !== run.lastObservedRepoHead)
    return 'head_changed';
  return 'none';
}

export function buildReconciliationProjection(input: {
  repositories: StateRepositories;
  project?: ProjectRecord;
  run?: RunRecord;
  inspection?: InspectedProject;
}) {
  const { repositories, project, run, inspection } = input;
  if (!project || !run || !inspection) {
    return {
      activeWork: [],
      pendingDecisions: [],
      evidenceRefs: [],
      cleanupRequiredResources: [],
      nextSafeAction: 'start_run' as const,
    };
  }

  const repoDrift = classifyRepoDrift(project, run, inspection);
  const activeWork = repositories
    .listActiveWorkItems(run.runId, PROJECTION_LIMIT)
    .map((item) => ({
      workItemId: item.workItemId,
      title: item.title,
      state: item.state,
      risk: item.risk,
      version: item.version,
      liveness: 'unknown' as const,
    }));
  const pendingDecisions = repositories
    .listPendingDecisions(run.runId, undefined, PROJECTION_LIMIT)
    .map((item) => ({
      decisionId: item.decisionId,
      ...(item.workItemId ? { workItemId: item.workItemId } : {}),
      question: item.question,
      authority: item.authority,
    }));
  const evidenceRefs = repositories
    .listEvidence(run.runId, PROJECTION_LIMIT)
    .map((item) => ({
      evidenceId: item.evidenceId,
      ...(item.workItemId ? { workItemId: item.workItemId } : {}),
      kind: item.kind,
      status: item.status,
      summary: item.summary,
    }));
  const cleanupRequiredResources = repositories
    .listCleanupRequiredResources(run.runId, PROJECTION_LIMIT)
    .map((item) => ({
      resourceId: item.resourceId,
      type: item.type,
      ...(item.nativeRef ? { nativeRef: item.nativeRef } : {}),
      status: item.status,
    }));
  const nextSafeAction =
    repoDrift !== 'none'
      ? 'inspect_repo_drift'
      : pendingDecisions.length > 0
        ? 'resolve_decision'
        : cleanupRequiredResources.length > 0
          ? 'inspect_cleanup'
          : activeWork.some((item) =>
                ['running', 'verifying'].includes(item.state),
              )
            ? 'reconcile_active_work'
            : activeWork.length > 0
              ? 'resume_work'
              : 'none';

  return {
    project: {
      projectId: project.projectId,
      repoRoot: project.repoRoot,
      repoFingerprint: project.repoFingerprint,
      ...(inspection.head ? { currentHead: inspection.head } : {}),
      repoDrift,
    },
    run: {
      runId: run.runId,
      objective: run.objective,
      state: run.state,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
    },
    activeWork,
    pendingDecisions,
    evidenceRefs,
    cleanupRequiredResources,
    nextSafeAction,
  };
}
