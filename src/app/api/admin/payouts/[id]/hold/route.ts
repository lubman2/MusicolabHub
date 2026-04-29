import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PAYOUT_PUBLIC_SELECT } from "@/lib/payouts";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/payouts/:id/hold
 *
 * Admin moderation: place an `admin_hold` on a payout. Allowed when the
 * payout is `blocked` (re-blocking with a different reason) or `scheduled`
 * (revoking a scheduled release). Records an AdminAction audit row.
 *
 * Body (all optional):
 *   reasonCode: string  — short label, e.g. "fraud_review"
 *   internalNote: string — internal-only context for the audit log
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: payoutId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    reasonCode?: unknown;
    internalNote?: unknown;
  };
  const reasonCode =
    typeof body.reasonCode === "string" ? body.reasonCode.trim() : "";
  const internalNote =
    typeof body.internalNote === "string" ? body.internalNote.trim() : "";

  const payout = await prisma.payoutRecord.findUnique({
    where: { id: payoutId },
    select: { id: true, status: true, blockReason: true },
  });
  if (!payout) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }
  if (payout.status !== "blocked" && payout.status !== "scheduled") {
    return NextResponse.json(
      { error: `Cannot hold a payout in ${payout.status} state` },
      { status: 409 },
    );
  }
  if (payout.status === "blocked" && payout.blockReason === "admin_hold") {
    return NextResponse.json(
      { error: "Payout is already on admin hold" },
      { status: 409 },
    );
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.payoutRecord.update({
      where: { id: payoutId },
      data: {
        status: "blocked",
        blockReason: "admin_hold",
        heldAt: now,
        heldByActorId: user.id,
        autoReleaseAt: null,
        scheduledFor: null,
      },
      select: PAYOUT_PUBLIC_SELECT,
    }),
    prisma.adminAction.create({
      data: {
        actorId: user.id,
        actionType: "hold_payout",
        targetType: "payout",
        targetId: payoutId,
        reasonCode: reasonCode || null,
        internalNote: internalNote || null,
      },
    }),
  ]);

  return NextResponse.json(updated);
}
