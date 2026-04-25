import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

const MIN_PASSWORD_LENGTH = 8;
const TOKEN_HEX_RE = /^[a-f0-9]{64}$/;

function validatePassword(password: string): string | null {
  if (!password || typeof password !== "string") return "Password is required";
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > 128) return "Password too long";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  return null;
}

export async function POST(req: NextRequest) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = body.token;
  const password = body.password;

  if (!token || typeof token !== "string" || !TOKEN_HEX_RE.test(token)) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const passwordError = validatePassword(password ?? "");
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 422 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const reset = await prisma.passwordReset.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { status: true } },
    },
  });

  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Invalid or expired token", code: "INVALID_TOKEN" },
      { status: 400 },
    );
  }

  if (reset.user.status === "suspended") {
    return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  }

  const passwordHash = await hashPassword(password!);
  const now = new Date();

  // Mark token used and invalidate any other outstanding resets for this user
  // in the same transaction as the password update, so a partial failure can't
  // leave stale tokens or an updated password without a used marker.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash },
    }),
    prisma.passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: now },
    }),
    prisma.passwordReset.updateMany({
      where: {
        userId: reset.userId,
        usedAt: null,
        id: { not: reset.id },
      },
      data: { usedAt: now },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
