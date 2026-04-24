import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.token) {
    return NextResponse.json(
      { error: "Verification token is required" },
      { status: 400 },
    );
  }

  const { token } = body as { token: string };

  const verification = await prisma.emailVerification.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!verification) {
    return NextResponse.json(
      { error: "Invalid verification token" },
      { status: 404 },
    );
  }

  if (verification.usedAt) {
    return NextResponse.json(
      { error: "Verification token already used" },
      { status: 410 },
    );
  }

  if (verification.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Verification token expired" },
      { status: 410 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: verification.userId },
      data: { status: "verified" },
    });

    await tx.emailVerification.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    });
  });

  await createSessionCookie({
    userId: verification.user.id,
    role: verification.user.role,
    status: "verified",
  });

  return NextResponse.json({ success: true });
}
