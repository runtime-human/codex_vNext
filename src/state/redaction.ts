const REDACTED = '[REDACTED]';

export function redactSensitiveText(value: string): string {
  return value
    .replace(
      /Authorization:\s*Bearer\s+\S+/gi,
      `Authorization: Bearer ${REDACTED}`,
    )
    .replace(/\bBearer\s+\S+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b(token|api_key|apikey|password|secret)\s*=\s*[^\s&,;]+/gi,
      (_match, key: string) => `${key}=${REDACTED}`,
    )
    .replace(/\bgithub_pat_[A-Za-z0-9_]+/g, REDACTED)
    .replace(/\bghp_[A-Za-z0-9_]+/g, REDACTED)
    .replace(/\bsk-[A-Za-z0-9_-]+/g, REDACTED);
}
