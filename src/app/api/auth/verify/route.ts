import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid token", code: "INVALID_TOKEN" },
      { status: 400 },
    );
  }

  const verification = await prisma.emailVerification.findUnique({
    where: { token },
    include: { user: { select: { id: true, status: true } } },
  });

  if (!verification) {
    return NextResponse.json(
      { error: "Invalid verification token", code: "INVALID_TOKEN" },
      { status: 400 },
    );
  }

  // Already used
  if (verification.usedAt) {
    if (verification.user.status === "verified" || verification.user.status === "onboarded") {
      return NextResponse.json(
        { error: "Account already verified", code: "ALREADY_VERIFIED" },
        { status: 200 },
      );
    }
    // Token was used but user somehow not verified — treat as invalid
    return NextResponse.json(
      { error: "Token already used", code: "INVALID_TOKEN" },
      { status: 400 },
    );
  }

  // Expired
  if (new Date() > verification.expiresAt) {
    return NextResponse.json(
      {
        error: "Verification token has expired",
        code: "TOKEN_EXPIRED",
        userId: verification.userId,
      },
      { status: 410 },
    );
  }

  // Verify: set user status + mark token as used in one transaction
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

  return NextResponse.json({ message: "Email verified successfully", code: "VERIFIED" });
}
