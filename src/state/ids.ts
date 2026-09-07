import { randomUUID } from 'node:crypto';

export const newRunId = () => `run_${randomUUID()}`;
export const newWorkItemId = () => `work_${randomUUID()}`;
export const newDecisionId = () => `decision_${randomUUID()}`;
export const newEvidenceId = () => `evidence_${randomUUID()}`;
export const newResourceId = () => `resource_${randomUUID()}`;
export const newEventId = () => `event_${randomUUID()}`;
export const newArtifactId = () => `artifact_${randomUUID()}`;
