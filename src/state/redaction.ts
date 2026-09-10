const REDACTED = '[REDACTED]';

const SENSITIVE_KEY =
  '(?:access[-_]?token|x[-_]?api[-_]?key|api[-_]?key|apikey|password|client[-_]?secret|secret|token)';

function redactValue(value: string): string {
  if (value.length >= 2 && value[0] === value[value.length - 1]) {
    return `${value[0]}${REDACTED}${value[value.length - 1]}`;
  }
  return REDACTED;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(
      /(\bAuthorization\s*:\s*)(Basic|Bearer)(\s+)(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s,;]+)/gi,
      (_match, prefix: string, scheme: string, whitespace: string) =>
        `${prefix}${scheme}${whitespace}${REDACTED}`,
    )
    .replace(/\bBearer\s+\S+/gi, `Bearer ${REDACTED}`)
    .replace(
      new RegExp(
        `(?<![\\w-])(?<key>${SENSITIVE_KEY})(?<keyQuote>["']?)(?<separator>\\s*(?:=|:)\\s*)(?<secret>"(?:\\\\.|[^"\\\\\\r\\n])*"|'(?:\\\\.|[^'\\\\\\r\\n])*'|[^\\s&,;}\\]"']+)`,
        'gi',
      ),
      (
        _match,
        key: string,
        keyQuote: string,
        separator: string,
        secret: string,
      ) => `${key}${keyQuote}${separator}${redactValue(secret)}`,
    )
    .replace(
      new RegExp(
        `(?<![\\w-])(?<prefix>--${SENSITIVE_KEY}(?:\\s+|=))(?<secret>"(?:\\\\.|[^"\\\\\\r\\n])*"|'(?:\\\\.|[^'\\\\\\r\\n])*'|[^\\s&,;]+)`,
        'gi',
      ),
      (_match, prefix: string, secret: string) =>
        `${prefix}${redactValue(secret)}`,
    )
    .replace(
      /\b([a-z][a-z\d+.-]*:\/\/)([^/\s?#@]+):([^/\s?#@]+)@/gi,
      (_match, scheme: string, username: string) =>
        `${scheme}${username}:${REDACTED}@`,
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
