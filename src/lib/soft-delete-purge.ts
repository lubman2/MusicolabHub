import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/s3";

/**
 * 30-day retention purge for soft-deleted content (audit RBAC-24).
 * Order matters: standalone files → standalone versions → whole projects.
 * S3 deletion is best-effort per object; an S3 failure skips that file's
 * row so it retries next sweep, but never blocks the rest of the batch.
 */

export const PURGE_RETENTION_DAYS = 30;

function cutoffFor(now: Date): Date {
  return new Date(now.getTime() - PURGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export async function runSoftDeletePurgeSweep(
  now: Date = new Date(),
): Promise<{
  files: number;
  versions: number;
  projects: number;
  s3Failures: number;
}> {
  const cutoff = cutoffFor(now);
  let files = 0;
  let versions = 0;
  let projects = 0;
  let s3Failures = 0;

  // 1. Standalone soft-deleted files past retention.
  const dueFiles = await prisma.projectFile.findMany({
    where: { status: "deleted_soft", deletedAt: { lte: cutoff } },
    select: { id: true, s3Key: true },
  });
  for (const file of dueFiles) {
    if (await deleteObject(file.s3Key)) {
      await prisma.projectFile.delete({ where: { id: file.id } });
      files += 1;
    } else {
      s3Failures += 1;
    }
  }

  // 2. Standalone soft-deleted versions past retention (rows only —
  //    underlying files have their own lifecycle; VersionFile joins cascade).
  const deletedVersions = await prisma.projectVersion.deleteMany({
    where: { status: "deleted_soft", deletedAt: { lte: cutoff } },
  });
  versions = deletedVersions.count;

  // 3. Soft-deleted projects past retention: S3-purge ALL their files, then
  //    hard-delete the project row (cascades remove files/versions/members/…).
  const dueProjects = await prisma.project.findMany({
    where: { status: "deleted_soft", deletedAt: { lte: cutoff } },
    select: { id: true, files: { select: { s3Key: true } } },
  });
  for (const project of dueProjects) {
    let allGone = true;
    for (const f of project.files) {
      if (!(await deleteObject(f.s3Key))) {
        allGone = false;
        s3Failures += 1;
      }
    }
    if (allGone) {
      await prisma.project.delete({ where: { id: project.id } });
      projects += 1;
    }
    // else: leave the project row; retried next sweep.
  }

  return { files, versions, projects, s3Failures };
}
