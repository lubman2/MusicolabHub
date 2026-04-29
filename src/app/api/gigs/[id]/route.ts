import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  GIG_PUBLIC_SELECT,
  canTransitionGigStatus,
  loadGigForOwner,
  parseGigPatch,
} from "@/lib/gigs";
import { logActivity } from "@/lib/activity-log";
import type { ActivityAction, GigStatus } from "@/generated/prisma/client";

type RouteParams = { params: Promise<{ id: string }> };

const VALID_TRANSITION_TARGETS: GigStatus[] = [
  "published",
  "closed",
  "cancelled",
];

/**
 * GET /api/gigs/[id] — fetch a gig.
 *
 * - Project owner sees their gig at any status.
 * - Project members see only published gigs (drafts are private workspace).
 * - Other authenticated users see only published gigs.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gigId } = await params;

  const gig = await prisma.gig.findUnique({
    where: { id: gigId },
    select: {
      ...GIG_PUBLIC_SELECT,
      project: {
        select: {
          id: true,
          title: true,
          genre: true,
          ownerId: true,
          deletedAt: true,
          status: true,
        },
      },
      creator: {
        select: {
          id: true,
          email: true,
          profile: {
            select: { displayName: true, headline: true, avatarUrl: true },
          },
        },
      },
    },
  });

  if (!gig || gig.project.deletedAt !== null) {
    return NextResponse.json({ error: "Gig not found" }, { status: 404 });
  }

  const isOwner = gig.project.ownerId === user.id;
  if (!isOwner && gig.status !== "published") {
    return NextResponse.json({ error: "Gig not found" }, { status: 404 });
  }

  return NextResponse.json(gig);
}

/**
 * PATCH /api/gigs/[id] — owner-only update of a gig.
 *
 * Body may include any subset of editable fields (title, description,
 * skills, genres, budgetMin, budgetMax, budgetCurrency, deadline).
 *
 * If `status` is supplied it triggers a lifecycle transition:
 *   draft → published | cancelled
 *   published → closed | cancelled
 * The corresponding `*At` timestamp is stamped automatically.
 *
 * Editable fields can only be updated while the gig is in `draft`.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gigId } = await params;

  const auth = await loadGigForOwner(gigId, user.id);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { status: rawStatus, ...rest } = body;

  let nextStatus: GigStatus | undefined;
  const data: Record<string, unknown> = {};

  if (rawStatus !== undefined) {
    if (typeof rawStatus !== "string") {
      return NextResponse.json(
        { error: "status must be a string" },
        { status: 400 },
      );
    }
    if (!VALID_TRANSITION_TARGETS.includes(rawStatus as GigStatus)) {
      return NextResponse.json(
        {
          error: `status must be one of: ${VALID_TRANSITION_TARGETS.join(", ")}`,
        },
        { status: 400 },
      );
    }
    nextStatus = rawStatus as GigStatus;
    if (!canTransitionGigStatus(auth.gig.status, nextStatus)) {
      return NextResponse.json(
        {
          error: `Cannot transition from ${auth.gig.status} to ${nextStatus}`,
        },
        { status: 409 },
      );
    }
    data.status = nextStatus;
    if (nextStatus === "published") data.publishedAt = new Date();
    if (nextStatus === "closed") data.closedAt = new Date();
    if (nextStatus === "cancelled") data.cancelledAt = new Date();
  }

  const hasFieldUpdates = Object.keys(rest).length > 0;
  if (hasFieldUpdates) {
    if (auth.gig.status !== "draft") {
      return NextResponse.json(
        { error: "Gig fields can only be edited while in draft" },
        { status: 409 },
      );
    }
    const parsed = parseGigPatch(rest);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error.error },
        { status: parsed.error.status },
      );
    }
    Object.assign(data, parsed.data);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "no fields supplied" },
      { status: 400 },
    );
  }

  // Cancelling a published gig must expire any open applications so
  // they don't linger as actionable items. We do this in the same txn
  // as the gig update for consistency.
  const isCancellingPublished =
    nextStatus === "cancelled" && auth.gig.status === "published";
  const isClosingPublished =
    nextStatus === "closed" && auth.gig.status === "published";

  const updated = await prisma.$transaction(async (tx) => {
    const g = await tx.gig.update({
      where: { id: gigId },
      data,
      select: GIG_PUBLIC_SELECT,
    });
    if (isCancellingPublished || isClosingPublished) {
      await tx.gigApplication.updateMany({
        where: { gigId, status: "submitted" },
        data: { status: "expired", expiredAt: new Date() },
      });
    }
    return g;
  });

  if (nextStatus) {
    const lifecycleAction: Record<
      "published" | "closed" | "cancelled",
      ActivityAction
    > = {
      published: "gig_published",
      closed: "gig_closed",
      cancelled: "gig_cancelled",
    };
    const action = lifecycleAction[nextStatus as keyof typeof lifecycleAction];
    if (action) {
      await logActivity(
        auth.gig.projectId,
        user.id,
        action,
        { type: "gig", id: gigId },
        { gigTitle: updated.title, fromStatus: auth.gig.status },
      );
    }
  }

  return NextResponse.json(updated);
}

/**
 * DELETE /api/gigs/[id] — owner-only hard delete, allowed only on drafts.
 *
 * Published, closed, cancelled, and suspended gigs are retained for
 * audit and admin-action history; the lifecycle transitions own removal
 * from public discovery.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gigId } = await params;

  const auth = await loadGigForOwner(gigId, user.id);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (auth.gig.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft gigs can be deleted; cancel a published gig instead" },
      { status: 409 },
    );
  }

  await prisma.gig.delete({ where: { id: gigId } });

  return NextResponse.json({ ok: true });
}
