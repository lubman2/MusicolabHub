import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/verify-email?token=... — target of the signup e-mail link.
 * Redirects to /login with a status flag rather than returning JSON,
 * because the user arrives here by clicking a link in their mail client.
 */
export async function GET(request: NextRequest) {
  const redirectToLogin = (params: string) =>
    NextResponse.redirect(new URL(`/login${params}`, request.nextUrl.origin));

  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return redirectToLogin("?verify_error=invalid");
  }

  const verification = await prisma.emailVerification.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { status: true } },
    },
  });

  if (!verification) {
    return redirectToLogin("?verify_error=invalid");
  }

  if (verification.usedAt) {
    // Re-clicked link (mail-scanner prefetch, double click): if the account
    // already made it past unverified, treat as success.
    return verification.user.status !== "unverified"
      ? redirectToLogin("?verified=1")
      : redirectToLogin("?verify_error=invalid");
  }

  if (verification.expiresAt < new Date()) {
    return redirectToLogin("?verify_error=expired");
  }

  await prisma.$transaction([
    ...(verification.user.status === "unverified"
      ? [
          prisma.user.update({
            where: { id: verification.userId },
            data: { status: "verified" },
          }),
        ]
      : []),
    prisma.emailVerification.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate any other outstanding verification tokens for this user
    prisma.emailVerification.updateMany({
      where: {
        userId: verification.userId,
        usedAt: null,
        id: { not: verification.id },
      },
      data: { usedAt: new Date() },
    }),
  ]);

  return redirectToLogin("?verified=1");
}
