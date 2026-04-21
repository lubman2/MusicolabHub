import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";
import type { MemberRole } from "@/generated/prisma/enums";

/**
 * Returns the authenticated user for the current request, or null.
 * TODO(EPIC-01): Replace with real session/JWT validation.
 */
export async function getCurrentUser(
  req: NextRequest,
): Promise<User | null> {
  // Stub: auth EPIC-01 will implement real session lookup.
  // In development, reads x-user-id header for testing.
  if (process.env.NODE_ENV === "development") {
    const userId = req.headers.get("x-user-id");
    if (userId) {
      return prisma.user.findUnique({ where: { id: userId } });
    }
  }
  return null;
}

/**
 * Extract authenticated user from request.
 * Stub: reads x-user-id header. Will be replaced by real auth (EPIC-01).
 */
export async function getAuthUser(
  request: Request
): Promise<User | null> {
  const userId = request.headers.get("x-user-id");
  if (!userId) return null;

  return prisma.user.findUnique({ where: { id: userId } });
}

/**
 * Extracts the authenticated user ID from the request.
 * TODO: Replace with real session/JWT verification once auth is wired up.
 */
export function getUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

/**
 * Checks whether the user has one of the allowed roles on the given project.
 * Project owners are always authorized (owner role is implicit via Project.ownerId).
 */
export async function authorizeProjectMember(
  userId: string,
  projectId: string,
  allowedRoles: MemberRole[],
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) return false;

  // Owner is always authorized
  if (project.ownerId === userId) return true;

  // Check membership
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  if (!member) return false;

  return allowedRoles.includes(member.role);
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
