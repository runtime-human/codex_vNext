import { z } from 'zod';

export const ProjectIdSchema = z.string().min(1);
export const RunIdSchema = z.string().min(1);
export const WorkItemIdSchema = z.string().min(1);
export const TaskIdSchema = z.string().min(1);
export const EvidenceIdSchema = z.string().min(1);
export const DecisionIdSchema = z.string().min(1);
export const ContextIdSchema = z.string().min(1);

export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type RunId = z.infer<typeof RunIdSchema>;
export type WorkItemId = z.infer<typeof WorkItemIdSchema>;
export type TaskId = z.infer<typeof TaskIdSchema>;
export type EvidenceId = z.infer<typeof EvidenceIdSchema>;
export type DecisionId = z.infer<typeof DecisionIdSchema>;
export type ContextId = z.infer<typeof ContextIdSchema>;
