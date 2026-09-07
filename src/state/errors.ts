export type StateErrorCode =
  | 'INVALID_ARGUMENT'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'COMPLETION_BLOCKED'
  | 'STORAGE_UNAVAILABLE'
  | 'MIGRATION_CONFLICT'
  | 'INTEGRITY_FAILED'
  | 'PATH_OUTSIDE_ROOT'
  | 'INTERNAL';

export class StateError extends Error {
  constructor(
    readonly code: StateErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StateError';
  }
}
