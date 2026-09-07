import { StateError } from '../state/index.js';

export function success(value: unknown, summary: string) {
  return {
    structuredContent: { ok: true as const, value },
    content: [{ type: 'text' as const, text: summary }],
  };
}

export function failure(error: unknown) {
  const stateError =
    error instanceof StateError
      ? error
      : new StateError('INTERNAL', 'workflow state operation failed');
  return {
    isError: true as const,
    structuredContent: {
      ok: false as const,
      error: {
        code: stateError.code,
        message: stateError.message,
        ...(stateError.details ? { details: stateError.details } : {}),
      },
    },
    content: [
      {
        type: 'text' as const,
        text: `${stateError.code}: ${stateError.message}`,
      },
    ],
  };
}

export async function asToolResult<T>(
  operation: () => T | Promise<T>,
  summarize: (value: T) => string,
) {
  try {
    const value = await operation();
    return success(value, summarize(value));
  } catch (error) {
    return failure(error);
  }
}
