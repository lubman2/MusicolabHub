import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { GIG_PUBLIC_SELECT, parseGigDraft } from "@/lib/gigs";
import { logActivity } from "@/lib/activity-log";
import { withActiveSubscription } from "@/lib/subscription";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/gigs — list all gigs (any status) under a project
 * for the project owner. Members see only published gigs.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active", deletedAt: null },
    select: { ownerId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const isOwner = project.ownerId === user.id;
  let isMember = false;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    isMember = true;
  }

  const where = isOwner
    ? { projectId }
    : { projectId, status: "published" as const };

  const gigs = await prisma.gig.findMany({
    where,
    select: GIG_PUBLIC_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: gigs, meta: { isOwner, isMember } });
}

/**
 * POST /api/projects/[id]/gigs — create a new gig draft under a project.
 *
 * Only the project owner may create gigs (Stream 2 scope; editors do not
 * have permission to expose work to the marketplace on the owner's behalf).
 * The gig starts in `draft` status and is published via a separate call.
 */
export const POST = withActiveSubscription(
  "write",
  async (request, { user }, routeContext) => {
  const { params } = routeContext as RouteParams;
  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active", deletedAt: null },
    select: { ownerId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can create gigs" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseGigDraft(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error.error },
      { status: parsed.error.status },
    );
  }

  const gig = await prisma.gig.create({
    data: {
      projectId,
      creatorId: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      skills: parsed.data.skills,
      genres: parsed.data.genres,
      budgetMin: parsed.data.budgetMin,
      budgetMax: parsed.data.budgetMax,
      budgetCurrency: parsed.data.budgetCurrency,
      deadline: parsed.data.deadline,
      status: "draft",
    },
    select: GIG_PUBLIC_SELECT,
  });

  await logActivity(
    projectId,
    user.id,
    "gig_created",
    { type: "gig", id: gig.id },
    { gigTitle: gig.title },
  );

  return NextResponse.json(gig, { status: 201 });
  },
);
