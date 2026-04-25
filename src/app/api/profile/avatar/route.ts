import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  ALLOWED_AVATAR_EXTENSIONS,
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_SIZE,
  buildAvatarS3Key,
  generateAvatarUploadUrl,
  getExtension,
} from "@/lib/profile";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.status === "unverified") {
    return NextResponse.json(
      { error: "Email must be verified", code: "UNVERIFIED" },
      { status: 403 },
    );
  }
  if (user.status === "suspended") {
    return NextResponse.json(
      { error: "Account suspended", code: "SUSPENDED" },
      { status: 403 },
    );
  }

  let body: { filename?: unknown; mimeType?: unknown; fileSize?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filename, mimeType, fileSize } = body;

  if (
    typeof filename !== "string" ||
    !filename.trim() ||
    typeof mimeType !== "string" ||
    typeof fileSize !== "number"
  ) {
    return NextResponse.json(
      { error: "filename, mimeType, and fileSize are required" },
      { status: 400 },
    );
  }

  const ext = getExtension(filename);
  if (!ALLOWED_AVATAR_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: "Avatar must be a .jpg, .jpeg, or .png file" },
      { status: 400 },
    );
  }

  if (!ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: "Avatar must be a JPEG or PNG image" },
      { status: 400 },
    );
  }

  if (fileSize <= 0 || fileSize > MAX_AVATAR_SIZE) {
    return NextResponse.json(
      { error: `Avatar must be between 1 byte and ${MAX_AVATAR_SIZE} bytes` },
      { status: 400 },
    );
  }

  const s3Key = buildAvatarS3Key(user.id, filename);
  const uploadUrl = await generateAvatarUploadUrl(s3Key, mimeType);

  return NextResponse.json({ uploadUrl, avatarKey: s3Key }, { status: 201 });
}
