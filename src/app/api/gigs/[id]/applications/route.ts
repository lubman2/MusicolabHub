import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  APPLICATION_PUBLIC_SELECT,
  parseApplicationDraft,
} from "@/lib/applications";
import { logActivity } from "@/lib/activity-log";
import { createNotification } from "@/lib/notifications";

type RouteParams = { params: Promise<{ id: string }> };

const APPLICANT_PROFILE_SELECT = {
  id: true,
  email: true,
  profile: {
    select: {
      displayName: true,
      headline: true,
      avatarUrl: true,
    },
  },
} as const;

/**
 * GET /api/gigs/[id]/applications — list applications for a gig.
 *
 * - Project owner sees every application.
 * - Authenticated talent sees only their own (if any).
 * - Other authenticated users get an empty list (the gig may be public,
 *   but the applicant pool is not).
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
      id: true,
      status: true,
      project: { select: { ownerId: true, deletedAt: true } },
    },
  });
  if (!gig || gig.project.deletedAt !== null) {
    return NextResponse.json({ error: "Gig not found" }, { status: 404 });
  }

  const isOwner = gig.project.ownerId === user.id;

  const where = isOwner
    ? { gigId }
    : { gigId, applicantId: user.id };

  const applications = await prisma.gigApplication.findMany({
    where,
    select: {
      ...APPLICATION_PUBLIC_SELECT,
      applicant: { select: APPLICANT_PROFILE_SELECT },
    },
    orderBy: { submittedAt: "desc" },
  });

  return NextResponse.json({ data: applications });
}

/**
 * POST /api/gigs/[id]/applications — submit a new application.
 *
 * - Gig must be `published`.
 * - Project owner cannot apply to their own gig.
 * - One active application per (gig, applicant) — withdrawn/expired/rejected
 *   applications do not block re-applying.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gigId } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseApplicationDraft(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error.error },
      { status: parsed.error.status },
    );
  }

  const gig = await prisma.gig.findUnique({
    where: { id: gigId },
    select: {
      id: true,
      title: true,
      status: true,
      projectId: true,
      project: { select: { ownerId: true, deletedAt: true, status: true } },
    },
  });
  if (
    !gig ||
    gig.project.deletedAt !== null ||
    gig.project.status !== "active"
  ) {
    return NextResponse.json({ error: "Gig not found" }, { status: 404 });
  }
  if (gig.status !== "published") {
    return NextResponse.json(
      { error: "Only published gigs accept applications" },
      { status: 409 },
    );
  }
  if (gig.project.ownerId === user.id) {
    return NextResponse.json(
      { error: "You cannot apply to your own gig" },
      { status: 409 },
    );
  }

  const existingActive = await prisma.gigApplication.findFirst({
    where: {
      gigId,
      applicantId: user.id,
      status: { in: ["submitted", "accepted"] },
    },
    select: { id: true, status: true },
  });
  if (existingActive) {
    return NextResponse.json(
      {
        error:
          existingActive.status === "accepted"
            ? "You have already been hired for this gig"
            : "You already have an active application for this gig",
      },
      { status: 409 },
    );
  }

  // Re-applying: if a closed application exists, replace it so the unique
  // (gigId, applicantId) constraint stays satisfied.
  const stale = await prisma.gigApplication.findUnique({
    where: { gigId_applicantId: { gigId, applicantId: user.id } },
    select: { id: true },
  });

  const application = stale
    ? await prisma.gigApplication.update({
        where: { id: stale.id },
        data: {
          coverNote: parsed.data.coverNote,
          proposedFee: parsed.data.proposedFee,
          status: "submitted",
          submittedAt: new Date(),
          decidedAt: null,
          withdrawnAt: null,
          expiredAt: null,
        },
        select: APPLICATION_PUBLIC_SELECT,
      })
    : await prisma.gigApplication.create({
        data: {
          gigId,
          applicantId: user.id,
          coverNote: parsed.data.coverNote,
          proposedFee: parsed.data.proposedFee,
        },
        select: APPLICATION_PUBLIC_SELECT,
      });

  await logActivity(
    gig.projectId,
    user.id,
    "gig_application_submitted",
    { type: "gig_application", id: application.id },
    { gigId, gigTitle: gig.title },
  );

  await createNotification({
    userId: gig.project.ownerId,
    type: "gig_application_received",
    title: `New application for "${gig.title}"`,
    body:
      parsed.data.coverNote.length > 140
        ? parsed.data.coverNote.slice(0, 137) + "…"
        : parsed.data.coverNote,
    sourceType: "gig_application",
    sourceId: application.id,
  });

  return NextResponse.json(application, { status: 201 });
}
