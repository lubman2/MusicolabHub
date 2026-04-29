import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { CONNECT_PUBLIC_SELECT } from "@/lib/connect";

/**
 * GET /api/connect/account
 *
 * Talent-facing read of the caller's own Connect account state.
 * Returns 404 if onboarding has never been initiated.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.connectAccount.findUnique({
    where: { userId: user.id },
    select: CONNECT_PUBLIC_SELECT,
  });

  if (!account) {
    return NextResponse.json(
      { error: "Connect account not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(account);
}
