import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/admin/gigs/:id/restore — admin moderation reversal.
 *
 * Reverses a previous suspend action: transitions a `suspended` gig back
 * to its prior state. We infer the prior state from `publishedAt`: if it
 * was previously published, restore to `published`; otherwise restore to
 * `draft`. Records an AdminAction audit row with actionType=`restore_gig`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: gigId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    reasonCode?: unknown;
    internalNote?: unknown;
  };
  const reasonCode =
    typeof body.reasonCode === "string" ? body.reasonCode.trim() : "";
  const internalNote =
    typeof body.internalNote === "string" ? body.internalNote.trim() : "";

  const gig = await prisma.gig.findUnique({
    where: { id: gigId },
    select: { id: true, status: true, publishedAt: true },
  });

  if (!gig) {
    return NextResponse.json({ error: "Gig not found" }, { status: 404 });
  }

  if (gig.status !== "suspended") {
    return NextResponse.json(
      { error: "Only suspended gigs can be restored" },
      { status: 409 },
    );
  }

  const restoredStatus = gig.publishedAt ? "published" : "draft";

  const [updated] = await prisma.$transaction([
    prisma.gig.update({
      where: { id: gigId },
      data: { status: restoredStatus, suspendedAt: null },
      select: { id: true, status: true, updatedAt: true, suspendedAt: true },
    }),
    prisma.adminAction.create({
      data: {
        actorId: user.id,
        actionType: "restore_gig",
        targetType: "gig",
        targetId: gigId,
        reasonCode: reasonCode || null,
        internalNote: internalNote || null,
      },
    }),
  ]);

  return NextResponse.json(updated);
}
