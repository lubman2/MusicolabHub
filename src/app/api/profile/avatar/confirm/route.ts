import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { checkFileExists } from "@/lib/s3";
import { isAvatarKey, resolveAvatarUrl } from "@/lib/profile";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { s3Key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { s3Key } = body;
  if (!s3Key || typeof s3Key !== "string") {
    return NextResponse.json({ error: "s3Key is required" }, { status: 400 });
  }

  const expectedPrefix = `users/${user.id}/avatar/`;
  if (!isAvatarKey(s3Key) || !s3Key.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: "Invalid avatar key for this user" },
      { status: 400 },
    );
  }

  const exists = await checkFileExists(s3Key);
  if (!exists) {
    return NextResponse.json(
      { error: "Upload not found in storage" },
      { status: 409 },
    );
  }

  await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, avatarUrl: s3Key },
    update: { avatarUrl: s3Key },
  });

  const avatarUrl = await resolveAvatarUrl(s3Key);

  return NextResponse.json({ avatarUrl });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.profile.updateMany({
    where: { userId: user.id },
    data: { avatarUrl: null },
  });

  return NextResponse.json({ avatarUrl: null });
}
