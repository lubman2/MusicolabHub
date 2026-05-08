/**
 * Demo seed for manual UI testing.
 *
 * Idempotent: safe to run repeatedly. Uses deterministic IDs so links in
 * docs/bookmarks stay stable across runs.
 *
 * Usage: `npm run db:seed`
 */
import { PrismaClient } from "../src/generated/prisma";
import { hashPassword } from "../src/lib/password";

const DEMO_PASSWORD = "Demo1234!";

const ID = {
  userAdmin: "seed-user-admin",
  userCreator1: "seed-user-creator1",
  userCreator2: "seed-user-creator2",
  project: "seed-project-demo",
  member: "seed-member-creator2",
  file: "seed-file-demo",
  version: "seed-version-1",
  thread: "seed-thread-1",
  comment: "seed-comment-1",
  splitRecord: "seed-split-1",
  contrib1: "seed-contrib-creator1",
  contrib2: "seed-contrib-creator2",
  subscription: "seed-sub-creator1",
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const passwordHash = await hashPassword(DEMO_PASSWORD);

    // ── Users ────────────────────────────────────────────────────────────
    const admin = await prisma.user.upsert({
      where: { email: "admin@example.com" },
      update: { passwordHash, status: "onboarded", role: "admin" },
      create: {
        id: ID.userAdmin,
        email: "admin@example.com",
        passwordHash,
        status: "onboarded",
        role: "admin",
      },
    });

    const creator1 = await prisma.user.upsert({
      where: { email: "creator1@example.com" },
      update: { passwordHash, status: "onboarded", role: "user" },
      create: {
        id: ID.userCreator1,
        email: "creator1@example.com",
        passwordHash,
        status: "onboarded",
        role: "user",
      },
    });

    const creator2 = await prisma.user.upsert({
      where: { email: "creator2@example.com" },
      update: { passwordHash, status: "onboarded", role: "user" },
      create: {
        id: ID.userCreator2,
        email: "creator2@example.com",
        passwordHash,
        status: "onboarded",
        role: "user",
      },
    });

    // ── Profiles ─────────────────────────────────────────────────────────
    await prisma.profile.upsert({
      where: { userId: admin.id },
      update: {},
      create: {
        userId: admin.id,
        displayName: "Admin",
        headline: "Platform admin",
        bio: "Demo admin account.",
        skills: [],
        genres: [],
      },
    });

    const creator1Profile = {
      displayName: "Alice Creator",
      headline: "Producer & mixing engineer",
      bio: "Indie producer based in Berlin. Loves analog warmth.",
      skills: ["production", "mixing", "mastering"],
      genres: ["hip-hop", "electronic"],
      priceRange: "€500–1000",
    };
    await prisma.profile.upsert({
      where: { userId: creator1.id },
      update: creator1Profile,
      create: { userId: creator1.id, ...creator1Profile },
    });

    const creator2Profile = {
      displayName: "Bob Collaborator",
      headline: "Vocalist & topliner",
      bio: "Session vocalist. Open to collabs.",
      skills: ["vocals", "songwriting"],
      genres: ["pop", "r&b"],
      priceRange: "€200–500",
    };
    await prisma.profile.upsert({
      where: { userId: creator2.id },
      update: creator2Profile,
      create: { userId: creator2.id, ...creator2Profile },
    });

    // ── Project ──────────────────────────────────────────────────────────
    const projectData = {
      ownerId: creator1.id,
      title: "Midnight Sessions",
      description: "Late-night beat-driven EP. Working title.",
      genre: "electronic",
      tags: ["wip", "demo"],
      status: "active" as const,
    };
    await prisma.project.upsert({
      where: { id: ID.project },
      update: projectData,
      create: { id: ID.project, ...projectData },
    });

    // ── Project member (creator2 as editor) ──────────────────────────────
    await prisma.projectMember.upsert({
      where: {
        projectId_userId: { projectId: ID.project, userId: creator2.id },
      },
      update: { role: "editor" },
      create: {
        id: ID.member,
        projectId: ID.project,
        userId: creator2.id,
        role: "editor",
      },
    });

    // ── File + version ───────────────────────────────────────────────────
    // Skip blob upload — store metadata only. s3Key is a placeholder.
    const fileData = {
      projectId: ID.project,
      uploaderId: creator1.id,
      filename: "midnight-session-v1.wav",
      originalName: "Midnight Session v1.wav",
      mimeType: "audio/wav",
      fileSize: 12_345_678,
      s3Key: `seed/${ID.file}/midnight-session-v1.wav`,
      s3Bucket: "seed-demo-bucket",
      status: "ready" as const,
    };
    await prisma.projectFile.upsert({
      where: { id: ID.file },
      update: fileData,
      create: { id: ID.file, ...fileData },
    });

    const versionData = {
      projectId: ID.project,
      authorId: creator1.id,
      name: "v1 — first rough mix",
      changelog: "Initial bounce. Drums + bass + synth pad.",
      status: "published" as const,
      publishedAt: new Date("2026-04-01T12:00:00Z"),
    };
    await prisma.projectVersion.upsert({
      where: { id: ID.version },
      update: versionData,
      create: { id: ID.version, ...versionData },
    });

    await prisma.versionFile.upsert({
      where: {
        versionId_fileId: { versionId: ID.version, fileId: ID.file },
      },
      update: {},
      create: { versionId: ID.version, fileId: ID.file },
    });

    // ── Comment thread + comment ─────────────────────────────────────────
    const threadData = {
      projectId: ID.project,
      targetType: "file" as const,
      targetId: ID.file,
      authorId: creator2.id,
      status: "open" as const,
    };
    await prisma.commentThread.upsert({
      where: { id: ID.thread },
      update: threadData,
      create: { id: ID.thread, ...threadData },
    });

    const commentData = {
      threadId: ID.thread,
      authorId: creator2.id,
      body: "Bass feels a bit muddy around 0:42 — try a high-pass at 60Hz?",
    };
    await prisma.comment.upsert({
      where: { id: ID.comment },
      update: commentData,
      create: { id: ID.comment, ...commentData },
    });

    // ── Split record (50/50 between creator1 and creator2) ───────────────
    const splitData = {
      projectId: ID.project,
      createdById: creator1.id,
      status: "draft" as const,
    };
    await prisma.splitRecord.upsert({
      where: { id: ID.splitRecord },
      update: splitData,
      create: { id: ID.splitRecord, ...splitData },
    });

    await prisma.splitContributor.upsert({
      where: {
        splitRecordId_userId: {
          splitRecordId: ID.splitRecord,
          userId: creator1.id,
        },
      },
      update: { role: "producer", percentage: "50.00" },
      create: {
        id: ID.contrib1,
        splitRecordId: ID.splitRecord,
        userId: creator1.id,
        role: "producer",
        percentage: "50.00",
      },
    });

    await prisma.splitContributor.upsert({
      where: {
        splitRecordId_userId: {
          splitRecordId: ID.splitRecord,
          userId: creator2.id,
        },
      },
      update: { role: "vocalist", percentage: "50.00" },
      create: {
        id: ID.contrib2,
        splitRecordId: ID.splitRecord,
        userId: creator2.id,
        role: "vocalist",
        percentage: "50.00",
      },
    });

    // ── Subscription (creator1 on Pro trial) ─────────────────────────────
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const subscriptionData = {
      plan: "pro" as const,
      status: "trialing" as const,
      trialEndsAt,
    };
    await prisma.subscription.upsert({
      where: { userId: creator1.id },
      update: subscriptionData,
      create: {
        id: ID.subscription,
        userId: creator1.id,
        ...subscriptionData,
      },
    });

    console.log("✓ Seed complete");
    console.log(`  Admin:    admin@example.com / ${DEMO_PASSWORD}`);
    console.log(`  Creator1: creator1@example.com / ${DEMO_PASSWORD} (Pro trial)`);
    console.log(`  Creator2: creator2@example.com / ${DEMO_PASSWORD}`);
    console.log(`  Project:  ${ID.project} (Midnight Sessions)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
