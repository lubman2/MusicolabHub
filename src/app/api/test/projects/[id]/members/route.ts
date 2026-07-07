import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { MemberRole } from "@/generated/prisma";

/**
 * POST /api/test/projects/:id/members — add a ProjectMember row directly.
 *
 * Gated behind `E2E_TEST_MODE=1`. Exists because this branch has no
 * invitation-accept flow yet (that lands in a separate PR) and the splits
 * "contributor must be a project member" rule otherwise has no reachable
 * path to satisfy in an e2e test. Mirrors the other `/api/test/*` seeding
 * helpers (gated the same way, 404s outside E2E_TEST_MODE).
 *
 * Body: { userId: string, role?: MemberRole }  (role defaults to "viewer")
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id: projectId } = await params;

  let body: { userId?: string; role?: MemberRole } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const member = await prisma.projectMember.upsert({
    where: {
      projectId_userId: { projectId, userId: body.userId },
    },
    create: {
      projectId,
      userId: body.userId,
      role: body.role ?? "viewer",
    },
    update: {},
    select: { id: true, projectId: true, userId: true, role: true },
  });

  return NextResponse.json(member, { status: 201 });
}
