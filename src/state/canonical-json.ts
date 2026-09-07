import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
      throw new TypeError('value is not JSON-compatible');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

export function hashMutationRequest(
  toolName: string,
  normalizedInput: unknown,
): string {
  return createHash('sha256')
    .update(canonicalJson({ inputWithoutCommandId: normalizedInput, toolName }))
    .digest('hex');
}
