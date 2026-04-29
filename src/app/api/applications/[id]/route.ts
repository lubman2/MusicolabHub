import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  APPLICATION_PUBLIC_SELECT,
  parseApplicationPatch,
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
 * GET /api/applications/[id] — fetch one application.
 *
 * Visible to the project owner (buyer) and the applicant only.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: applicationId } = await params;

  const application = await prisma.gigApplication.findUnique({
    where: { id: applicationId },
    select: {
      ...APPLICATION_PUBLIC_SELECT,
      applicant: { select: APPLICANT_PROFILE_SELECT },
      gig: {
        select: {
          id: true,
          title: true,
          projectId: true,
          status: true,
          project: { select: { ownerId: true, deletedAt: true } },
        },
      },
    },
  });
  if (!application || application.gig.project.deletedAt !== null) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const isOwner = application.gig.project.ownerId === user.id;
  const isApplicant = application.applicantId === user.id;
  if (!isOwner && !isApplicant) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  return NextResponse.json(application);
}

/**
 * PATCH /api/applications/[id] — update an application.
 *
 * Modes (mutually exclusive in one request):
 *   1. Talent edits coverNote/proposedFee while in `submitted`.
 *   2. Talent withdraws by sending `{ status: "withdrawn" }`.
 *   3. Owner rejects by sending `{ status: "rejected" }`. Rejection
 *      while gig is `published` only — accepting uses /accept.
 *
 * Acceptance is intentionally NOT routed through here because it has
 * cascading side effects (close competing apps, create Hire, transition
 * gig). Use POST /api/applications/[id]/accept instead.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: applicationId } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const application = await prisma.gigApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      gigId: true,
      applicantId: true,
      status: true,
      gig: {
        select: {
          id: true,
          title: true,
          projectId: true,
          status: true,
          project: { select: { ownerId: true, deletedAt: true } },
        },
      },
    },
  });
  if (!application || application.gig.project.deletedAt !== null) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 },
    );
  }

  const isOwner = application.gig.project.ownerId === user.id;
  const isApplicant = application.applicantId === user.id;
  if (!isOwner && !isApplicant) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 },
    );
  }

  const { status: rawStatus, ...rest } = body;

  if (rawStatus !== undefined) {
    if (typeof rawStatus !== "string") {
      return NextResponse.json(
        { error: "status must be a string" },
        { status: 400 },
      );
    }
    if (Object.keys(rest).length > 0) {
      return NextResponse.json(
        { error: "status transitions cannot change other fields" },
        { status: 400 },
      );
    }
    if (rawStatus === "withdrawn") {
      if (!isApplicant) {
        return NextResponse.json(
          { error: "Only the applicant can withdraw" },
          { status: 403 },
        );
      }
      if (application.status !== "submitted") {
        return NextResponse.json(
          { error: "Only submitted applications can be withdrawn" },
          { status: 409 },
        );
      }
      const updated = await prisma.gigApplication.update({
        where: { id: applicationId },
        data: {
          status: "withdrawn",
          withdrawnAt: new Date(),
          decidedAt: new Date(),
        },
        select: APPLICATION_PUBLIC_SELECT,
      });
      await logActivity(
        application.gig.projectId,
        user.id,
        "gig_application_withdrawn",
        { type: "gig_application", id: applicationId },
        { gigId: application.gigId },
      );
      return NextResponse.json(updated);
    }
    if (rawStatus === "rejected") {
      if (!isOwner) {
        return NextResponse.json(
          { error: "Only the project owner can reject applications" },
          { status: 403 },
        );
      }
      if (application.status !== "submitted") {
        return NextResponse.json(
          { error: "Only submitted applications can be rejected" },
          { status: 409 },
        );
      }
      const updated = await prisma.gigApplication.update({
        where: { id: applicationId },
        data: {
          status: "rejected",
          decidedAt: new Date(),
        },
        select: APPLICATION_PUBLIC_SELECT,
      });
      await logActivity(
        application.gig.projectId,
        user.id,
        "gig_application_rejected",
        { type: "gig_application", id: applicationId },
        { gigId: application.gigId },
      );
      await createNotification({
        userId: application.applicantId,
        type: "gig_application_rejected",
        title: `Application not selected — "${application.gig.title}"`,
        sourceType: "gig_application",
        sourceId: applicationId,
      });
      return NextResponse.json(updated);
    }
    if (rawStatus === "accepted") {
      return NextResponse.json(
        {
          error:
            "Use POST /api/applications/[id]/accept to accept an application",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: `Cannot transition application to ${rawStatus}` },
      { status: 400 },
    );
  }

  // Field edits (talent only, while still submitted).
  if (!isApplicant) {
    return NextResponse.json(
      { error: "Only the applicant can edit application fields" },
      { status: 403 },
    );
  }
  if (application.status !== "submitted") {
    return NextResponse.json(
      { error: "Application can only be edited while in submitted state" },
      { status: 409 },
    );
  }

  const parsed = parseApplicationPatch(rest);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error.error },
      { status: parsed.error.status },
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "no fields supplied" },
      { status: 400 },
    );
  }

  const updated = await prisma.gigApplication.update({
    where: { id: applicationId },
    data: parsed.data,
    select: APPLICATION_PUBLIC_SELECT,
  });

  return NextResponse.json(updated);
}
