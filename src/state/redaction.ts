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

export function sanitizePersistedUri(value: string): string | undefined {
  const redacted = redactSensitiveText(value);
  const scpLike = /^[^@\s]+@([^:\s]+):(.+)$/.exec(redacted);
  if (scpLike) return `${scpLike[1]}:${scpLike[2]}`;
  if (!/^[a-z][a-z\d+.-]*:/i.test(redacted)) return redacted;
  try {
    const url = new URL(redacted);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return redactSensitiveText(url.toString()).replace(/\/$/, '');
  } catch {
    return undefined;
  }
}
