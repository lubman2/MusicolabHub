/**
 * Validate a post-login redirect target from a query param. Only same-origin
 * absolute paths are allowed: must start with exactly one "/", the second
 * char must not be "/" or "\" (protocol-relative + backslash tricks), and no
 * control characters (the WHATWG URL parser strips tab/CR/LF, so
 * "/\t/evil.com" would otherwise resolve off-origin).
 */
export function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (/[\x00-\x1f\x7f]/.test(raw)) return null;
  if (!/^\/(?!\/|\\)/.test(raw)) return null;
  return raw;
}
