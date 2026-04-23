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

  // Find the verification record
  const verification = await prisma.emailVerification.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!verification) {
    return NextResponse.json(
      { error: "Invalid verification token" },
      { status: 400 },
    );
  }

  // Check if already used
  if (verification.usedAt) {
    return NextResponse.json(
      {
        error: "This verification link has already been used",
        code: "ALREADY_USED",
        userStatus: verification.user.status,
      },
      { status: 400 },
    );
  }

  // Check if expired
  const now = new Date();
  if (now > verification.expiresAt) {
    return NextResponse.json(
      {
        error: "This verification link has expired",
        code: "EXPIRED",
        email: verification.user.email,
      },
      { status: 400 },
    );
  }

  // Check if user is already verified
  if (verification.user.status === "verified" || verification.user.status === "onboarded") {
    // Mark token as used anyway
    await prisma.emailVerification.update({
      where: { id: verification.id },
      data: { usedAt: now },
    });

    return NextResponse.json(
      {
        message: "Email already verified",
        code: "ALREADY_VERIFIED",
        status: verification.user.status,
      },
      { status: 200 },
    );
  }

  // Verify the user
  await prisma.$transaction([
    prisma.user.update({
      where: { id: verification.userId },
      data: { status: "verified" },
    }),
    prisma.emailVerification.update({
      where: { id: verification.id },
      data: { usedAt: now },
    }),
  ]);

  return NextResponse.json(
    {
      message: "Email verified successfully",
      userId: verification.userId,
    },
    { status: 200 },
  );
}
