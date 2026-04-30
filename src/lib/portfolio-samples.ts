export const MAX_PORTFOLIO_SAMPLES = 10;
export const MAX_SAMPLE_TITLE = 120;
export const MAX_SAMPLE_URL = 2048;
export const MAX_SAMPLE_MIME = 100;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function validateSampleUrl(value: unknown): string | { error: string } {
  if (typeof value !== "string") return { error: "url must be a string" };
  const trimmed = value.trim();
  if (!trimmed) return { error: "url is required" };
  if (trimmed.length > MAX_SAMPLE_URL) {
    return { error: `url must be ${MAX_SAMPLE_URL} characters or fewer` };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "url must be a valid URL" };
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { error: "url must use http or https" };
  }
  return parsed.toString();
}

export function validateSampleTitle(
  value: unknown,
): string | { error: string } {
  if (typeof value !== "string") return { error: "title must be a string" };
  const trimmed = value.trim();
  if (!trimmed) return { error: "title is required" };
  if (trimmed.length > MAX_SAMPLE_TITLE) {
    return { error: `title must be ${MAX_SAMPLE_TITLE} characters or fewer` };
  }
  return trimmed;
}

export function validateSampleMimeType(
  value: unknown,
): string | null | { error: string } {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return { error: "mimeType must be a string" };
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_SAMPLE_MIME) {
    return { error: `mimeType must be ${MAX_SAMPLE_MIME} characters or fewer` };
  }
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(trimmed)) {
    return { error: "mimeType must be a valid media type" };
  }
  return trimmed;
}
