import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ── Config ───────────────────────────────────────────────────────────

export const S3_BUCKET = process.env.AWS_S3_BUCKET!;
export const S3_REGION = process.env.AWS_REGION ?? "eu-central-1";

/** Maximum upload size in bytes (2 GB per PRD). */
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

/** Default presigned-URL expiry for downloads (1 hour). */
const DEFAULT_DOWNLOAD_EXPIRES_IN = 3600;

/** Default presigned-URL expiry for uploads (15 minutes). */
const DEFAULT_UPLOAD_EXPIRES_IN = 900;

// ── S3 client (singleton) ────────────────────────────────────────────

const globalForS3 = globalThis as unknown as { s3Client: S3Client | undefined };

function createS3Client() {
  return new S3Client({ region: S3_REGION });
}

export const s3 = globalForS3.s3Client ?? createS3Client();

if (process.env.NODE_ENV !== "production") {
  globalForS3.s3Client = s3;
}

// ── Key helpers ──────────────────────────────────────────────────────

/**
 * Build the canonical S3 object key for a project file.
 *
 * Pattern: `projects/{projectId}/files/{fileId}/{filename}`
 */
export function buildS3Key(
  projectId: string,
  fileId: string,
  filename: string,
): string {
  return `projects/${projectId}/files/${fileId}/${filename}`;
}

// ── Presigned URLs ───────────────────────────────────────────────────

/**
 * Generate a presigned PUT URL for uploading a file to S3.
 *
 * @param key         - S3 object key (use `buildS3Key`)
 * @param contentType - MIME type (e.g. `audio/wav`)
 * @returns           - Presigned upload URL
 */
export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3, command, { expiresIn: DEFAULT_UPLOAD_EXPIRES_IN });
}

/**
 * Generate a presigned GET URL for downloading a file from S3.
 *
 * @param key       - S3 object key
 * @param expiresIn - URL lifetime in seconds (defaults to 1 hour)
 * @returns         - Presigned download URL
 */
export async function generatePresignedDownloadUrl(
  key: string,
  expiresIn: number = DEFAULT_DOWNLOAD_EXPIRES_IN,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  return getSignedUrl(s3, command, { expiresIn });
}
