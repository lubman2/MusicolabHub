import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

const MIN_PASSWORD_LENGTH = 8;

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

  const { token, password } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token is required" }, { status: 422 });
  }

  const passwordError = validatePassword(password ?? "");
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 422 });
  }

  const reset = await prisma.passwordReset.findUnique({
    where: { token },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!reset || reset.usedAt) {
    return NextResponse.json(
      { error: "Invalid or expired token", code: "INVALID_TOKEN" },
      { status: 400 },
    );
  }

  if (reset.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Token expired. Request a new password reset.", code: "EXPIRED" },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password!);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash },
    }),
    prisma.passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate any other outstanding reset tokens for this user
    prisma.passwordReset.updateMany({
      where: { userId: reset.userId, usedAt: null, id: { not: reset.id } },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
