import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/admin/gigs/:id/suspend — admin moderation action.
 *
 * Transitions a gig to status=`suspended`, hiding it from the marketplace
 * browse (which filters to `published`) and freezing its application
 * pipeline (apply/accept routes both require status=`published`). Records
 * an AdminAction audit row with actor, optional reasonCode and internalNote.
 *
 * Allowed source statuses: `draft`, `published`. Already-suspended gigs
 * return 409. Terminal-state gigs (`hired`, `closed`, `cancelled`) return 409.
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
    select: { id: true, status: true },
  });

  if (!gig) {
    return NextResponse.json({ error: "Gig not found" }, { status: 404 });
  }

  if (gig.status === "suspended") {
    return NextResponse.json(
      { error: "Gig is already suspended" },
      { status: 409 },
    );
  }

  if (gig.status !== "draft" && gig.status !== "published") {
    return NextResponse.json(
      { error: "Gig cannot be suspended in its current state" },
      { status: 409 },
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.gig.update({
      where: { id: gigId },
      data: { status: "suspended", suspendedAt: new Date() },
      select: { id: true, status: true, updatedAt: true, suspendedAt: true },
    }),
    prisma.adminAction.create({
      data: {
        actorId: user.id,
        actionType: "suspend_gig",
        targetType: "gig",
        targetId: gigId,
        reasonCode: reasonCode || null,
        internalNote: internalNote || null,
      },
    }),
  ]);

  return NextResponse.json(updated);
}
