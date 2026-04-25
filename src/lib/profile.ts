import { generatePresignedDownloadUrl } from "@/lib/s3";

export const MAX_DISPLAY_NAME = 80;
export const MAX_HEADLINE = 120;
export const MAX_BIO = 2000;
export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS = 20;

export const AVATAR_MAX_SIZE = 5 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
]);
export const AVATAR_ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png"]);

export function buildAvatarKey(userId: string, ext: string): string {
  const safeExt = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return `users/${userId}/avatar/${Date.now()}${safeExt}`;
}

export function isAvatarKey(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith("users/") && value.includes("/avatar/");
}

/**
 * Resolve a stored avatarUrl value (an S3 key) into a presigned download URL.
 * Returns null when input is empty. If the value already looks like an http URL,
 * returns it unchanged (forward compat with externally-hosted avatars).
 */
export async function resolveAvatarUrl(
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    return stored;
  }
  if (!isAvatarKey(stored)) return null;
  try {
    return await generatePresignedDownloadUrl(stored);
  } catch {
    return null;
  }
}

export function normalizeTags(value: unknown): string[] | string {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return "must be an array of strings";
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return "must contain only strings";
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_TAG_LENGTH) {
      return `each entry must be ${MAX_TAG_LENGTH} characters or fewer`;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length > MAX_TAGS) {
      return `at most ${MAX_TAGS} entries allowed`;
    }
  }
  return out;
}

export function optionalString(
  value: unknown,
  field: string,
  max: number,
): string | null | { error: string } {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return { error: `${field} must be a string` };
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    return { error: `${field} must be ${max} characters or fewer` };
  }
  return trimmed;
}

export function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}
