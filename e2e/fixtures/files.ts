import { randomBytes } from "crypto";
import { getDb } from "./db";

/**
 * Insert a `ready` ProjectFile directly in the DB, skipping the S3 upload.
 *
 * Real users hit `/api/projects/:id/files/upload-url` → PUT to S3 →
 * `/api/projects/:id/files/confirm`. The middle step requires a real S3
 * bucket, which CI environments don't have. To keep the happy path runnable
 * without S3, fixtures fabricate a `ready` row directly. The S3 contract is
 * covered separately by API/integration tests.
 */
export async function seedReadyFile(opts: {
  projectId: string;
  uploaderId: string;
  filename?: string;
  mimeType?: string;
  fileSize?: number;
}): Promise<{ id: string; filename: string }> {
  const db = await getDb();
  const filename = opts.filename ?? "demo.mp3";
  const mimeType = opts.mimeType ?? "audio/mpeg";
  const fileSize = opts.fileSize ?? 1024;
  const id = `e2e_${randomBytes(12).toString("hex")}`;

  await db.query(
    `INSERT INTO "ProjectFile"
       (id, "projectId", "uploaderId", filename, "originalName", "mimeType",
        "fileSize", "s3Key", "s3Bucket", status, "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ready'::"FileStatus", NOW(), NOW())`,
    [
      id,
      opts.projectId,
      opts.uploaderId,
      filename,
      filename,
      mimeType,
      fileSize,
      `e2e-fixture/${opts.projectId}/${id}/${filename}`,
      "e2e-fixture-bucket",
    ],
  );

  return { id, filename };
}

/** Attach a ProjectFile to a ProjectVersion (creates the join row). */
export async function attachFileToVersion(
  versionId: string,
  fileId: string,
): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO "VersionFile" ("versionId", "fileId") VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [versionId, fileId],
  );
}
