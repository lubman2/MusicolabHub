import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PAYMENT_PUBLIC_SELECT } from "@/lib/payments";
import { PAYOUT_PUBLIC_SELECT } from "@/lib/payouts";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/hires/[id]/payment
 *
 * Visible to the hire's buyer or talent. Returns the PaymentRecord
 * (if any) plus the linked PayoutRecord (if any) for this hire.
 *
 * Returns `{ payment: null, payout: null }` when no payment has been
 * initiated (rather than 404, so the UI can render a "pay now" CTA).
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: hireId } = await params;

  const hire = await prisma.hire.findUnique({
    where: { id: hireId },
    select: { id: true, buyerId: true, talentId: true },
  });

  if (!hire) {
    return NextResponse.json({ error: "Hire not found" }, { status: 404 });
  }
  if (hire.buyerId !== user.id && hire.talentId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payment = await prisma.paymentRecord.findUnique({
    where: { hireId },
    select: {
      ...PAYMENT_PUBLIC_SELECT,
      payout: { select: PAYOUT_PUBLIC_SELECT },
    },
  });

  if (!payment) {
    return NextResponse.json({ payment: null, payout: null });
  }

  const { payout, ...rest } = payment;
  return NextResponse.json({ payment: rest, payout });
}
