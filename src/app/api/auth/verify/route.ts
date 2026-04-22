import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "Verification token is required" },
      { status: 400 },
    );
  }

  const verification = await prisma.emailVerification.findUnique({
    where: { token },
    select: {
      id: true,
      expiresAt: true,
      usedAt: true,
      userId: true,
      user: { select: { status: true } },
    },
  });

  if (!verification) {
    return NextResponse.json(
      { error: "Invalid verification token", code: "INVALID_TOKEN" },
      { status: 400 },
    );
  }

  if (verification.user.status !== "unverified" || verification.usedAt) {
    return NextResponse.json(
      { error: "Email already verified", code: "ALREADY_VERIFIED" },
      { status: 409 },
    );
  }

  if (verification.expiresAt < new Date()) {
    return NextResponse.json(
      {
        error: "Verification link has expired",
        code: "TOKEN_EXPIRED",
        userId: verification.userId,
      },
      { status: 410 },
    );
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: verification.userId },
      data: { status: "verified" },
    }),
    prisma.emailVerification.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
