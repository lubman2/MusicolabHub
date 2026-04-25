import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generatePresignedUploadUrl } from "@/lib/s3";
import {
  AVATAR_ALLOWED_EXT,
  AVATAR_ALLOWED_MIME,
  AVATAR_MAX_SIZE,
  buildAvatarKey,
  getExtension,
} from "@/lib/profile";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.status === "suspended") {
    return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  }

  let body: { filename?: string; mimeType?: string; fileSize?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filename, mimeType, fileSize } = body;

  if (
    !filename || typeof filename !== "string" ||
    !mimeType || typeof mimeType !== "string" ||
    fileSize == null || typeof fileSize !== "number"
  ) {
    return NextResponse.json(
      { error: "filename, mimeType, and fileSize are required" },
      { status: 400 },
    );
  }

  const ext = getExtension(filename);
  if (!AVATAR_ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "Avatar must be a .jpg, .jpeg, or .png file" },
      { status: 400 },
    );
  }

  if (!AVATAR_ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json(
      { error: "Avatar must be image/jpeg or image/png" },
      { status: 400 },
    );
  }

  if (fileSize <= 0 || fileSize > AVATAR_MAX_SIZE) {
    return NextResponse.json(
      { error: `Avatar must be between 1 byte and ${AVATAR_MAX_SIZE} bytes` },
      { status: 400 },
    );
  }

  const s3Key = buildAvatarKey(user.id, ext);
  const uploadUrl = await generatePresignedUploadUrl(s3Key, mimeType);

  return NextResponse.json({ uploadUrl, s3Key }, { status: 201 });
}
