import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DELETE_RETENTION_DAYS } from "@/lib/account-request";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  "http://localhost:3000";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(
      `${APP_URL}/settings/account?delete=error&reason=missing_token`,
    );
  }

  const request = await prisma.accountRequest.findUnique({
    where: { verifyToken: token },
    select: {
      id: true,
      status: true,
      verifyTokenExpiresAt: true,
    },
  });

  if (!request || request.status !== "pending_verification") {
    return NextResponse.redirect(
      `${APP_URL}/settings/account?delete=error&reason=invalid_token`,
    );
  }

  if (
    !request.verifyTokenExpiresAt ||
    request.verifyTokenExpiresAt < new Date()
  ) {
    return NextResponse.redirect(
      `${APP_URL}/settings/account?delete=error&reason=expired`,
    );
  }

  const now = new Date();
  const scheduledFor = new Date(
    now.getTime() + DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.accountRequest.update({
    where: { id: request.id },
    data: {
      status: "pending",
      verifiedAt: now,
      scheduledFor,
      verifyToken: null,
      verifyTokenExpiresAt: null,
    },
  });

  return NextResponse.redirect(`${APP_URL}/settings/account?delete=verified`);
}
