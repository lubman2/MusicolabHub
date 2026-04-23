import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withActiveSubscription } from "@/lib/subscription";
import { checkFileExists } from "@/lib/s3";
import { logActivity } from "@/lib/activity-log";

export const POST = withActiveSubscription(
  "write",
  async (request, ctx, { params }: { params: Promise<{ id: string }> }) => {
    const { id: projectId } = await params;
    const user = ctx.user;

    // --- Parse body ---
    let body: { fileId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { fileId } = body;

    if (!fileId || typeof fileId !== "string") {
      return NextResponse.json(
        { error: "fileId is required" },
        { status: 400 },
      );
    }

    // --- Check project exists and authz ---
    const project = await prisma.project.findUnique({
      where: { id: projectId, status: "active" },
      select: { id: true, ownerId: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const isOwner = project.ownerId === user.id;
    let isEditor = false;
    if (!isOwner) {
      const membership = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
        select: { role: true },
      });
      isEditor = membership?.role === "editor" || membership?.role === "owner";
    }

    if (!isOwner && !isEditor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // --- Fetch file record ---
    const file = await prisma.projectFile.findUnique({
      where: { id: fileId },
    });

    if (!file || file.projectId !== projectId) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.status !== "uploading") {
      return NextResponse.json(
        { error: `File status is '${file.status}', expected 'uploading'` },
        { status: 409 },
      );
    }

    // --- Verify file exists in S3 ---
    const exists = await checkFileExists(file.s3Key);

    const newStatus = exists ? "ready" : "failed";
    const updated = await prisma.projectFile.update({
      where: { id: fileId },
      data: { status: newStatus },
    });

    // --- Log activity on success ---
    if (newStatus === "ready") {
      await logActivity(projectId, user.id, "file_uploaded", {
        type: "file",
        id: file.id,
      }, {
        filename: file.originalName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
      });
    }

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      filename: updated.originalName,
      mimeType: updated.mimeType,
      fileSize: updated.fileSize,
    });
  },
);
