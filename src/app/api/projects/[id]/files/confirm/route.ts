import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { objectExists } from "@/lib/s3";
import { logActivity } from "@/lib/activity-log";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  // --- Auth ---
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // --- Check project exists ---
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // --- Authz: owner or editor ---
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

  // --- Find file record ---
  const file = await prisma.projectFile.findUnique({
    where: { id: fileId },
  });

  if (!file || file.projectId !== projectId) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (file.status !== "uploading") {
    return NextResponse.json(
      { error: "File is not in uploading state" },
      { status: 409 },
    );
  }

  // --- Verify file exists in S3 ---
  const exists = await objectExists(file.s3Key);

  if (!exists) {
    const failed = await prisma.projectFile.update({
      where: { id: fileId },
      data: { status: "failed" },
    });
    return NextResponse.json(
      {
        error: "File not found in storage",
        file: {
          id: failed.id,
          status: failed.status,
        },
      },
      { status: 422 },
    );
  }

  // --- Mark as ready ---
  const updated = await prisma.projectFile.update({
    where: { id: fileId },
    data: { status: "ready" },
    select: {
      id: true,
      filename: true,
      originalName: true,
      mimeType: true,
      fileSize: true,
      s3Key: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // --- Activity log (fire-and-forget) ---
  logActivity(projectId, user.id, "file_uploaded", {
    type: "file",
    id: fileId,
  });

  return NextResponse.json(updated);
}
