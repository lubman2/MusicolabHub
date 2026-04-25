import {
  generatePresignedDownloadUrl,
  generatePresignedUploadUrl,
} from "@/lib/s3";

export const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export const ALLOWED_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
]);

export const ALLOWED_AVATAR_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

export function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

export function buildAvatarS3Key(userId: string, filename: string): string {
  const ext = getExtension(filename);
  return `avatars/${userId}/${Date.now()}${ext}`;
}

export async function generateAvatarUploadUrl(
  key: string,
  contentType: string,
): Promise<string> {
  return generatePresignedUploadUrl(key, contentType);
}

export async function resolveAvatarUrl(
  stored: string | null,
): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    return stored;
  }
  return generatePresignedDownloadUrl(stored, 3600);
}
