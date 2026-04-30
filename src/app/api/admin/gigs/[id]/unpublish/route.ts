import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/admin/gigs/:id/unpublish — admin moderation action.
 *
 * Lighter counterpart to suspend: transitions a `published` gig back to
 * `draft`, removing it from the marketplace and returning it to the
 * creator's editable workspace. Use this when the gig is salvageable
 * (e.g. needs edits) rather than a TOS violation. Records an AdminAction
 * audit row with actionType=`unpublish_gig`.
 *
 * Allowed source status: `published` only. All other statuses return 409.
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

  if (gig.status !== "published") {
    return NextResponse.json(
      { error: "Only published gigs can be unpublished" },
      { status: 409 },
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.gig.update({
      where: { id: gigId },
      data: { status: "draft", publishedAt: null },
      select: { id: true, status: true, updatedAt: true, publishedAt: true },
    }),
    prisma.adminAction.create({
      data: {
        actorId: user.id,
        actionType: "unpublish_gig",
        targetType: "gig",
        targetId: gigId,
        reasonCode: reasonCode || null,
        internalNote: internalNote || null,
      },
    }),
  ]);

  return NextResponse.json(updated);
}
