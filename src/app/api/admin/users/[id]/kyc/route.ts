import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { CONNECT_PUBLIC_SELECT } from "@/lib/connect";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/users/:id/kyc
 *
 * Read-only review of a user's Stripe Connect onboarding and KYC state.
 * Returns the locally-cached ConnectAccount snapshot (synced from Stripe via
 * webhooks). KYC verdicts are owned by Stripe — admin cannot override here.
 *
 * Responses:
 *   200 { connectAccount: ConnectAccount } — user has a Connect account
 *   200 { connectAccount: null }           — user has not started onboarding
 *   404                                     — user does not exist
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const actor = await getCurrentUser(req);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetUserId } = await params;

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const connectAccount = await prisma.connectAccount.findUnique({
    where: { userId: target.id },
    select: CONNECT_PUBLIC_SELECT,
  });

  return NextResponse.json({ connectAccount });
}
