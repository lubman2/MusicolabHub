import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken, type SessionPayload } from "@/lib/session";
import type { User } from "@/generated/prisma/client";
import type { MemberRole } from "@/generated/prisma/enums";

const COOKIE_NAME = "session";

/**
 * Extract session payload from the request cookie.
 */
async function getSessionFromRequest(
  req: NextRequest | Request,
): Promise<SessionPayload | null> {
  // NextRequest has cookies API directly
  const token =
    req instanceof NextRequest
      ? req.cookies.get(COOKIE_NAME)?.value
      : parseCookie(req.headers.get("cookie") ?? "", COOKIE_NAME);

  if (!token) return null;
  return verifyToken(token);
}

function parseCookie(header: string, name: string): string | undefined {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

/**
 * Returns the authenticated user for the current request, or null.
 */
export async function getCurrentUser(
  req: NextRequest,
): Promise<User | null> {
  const session = await getSessionFromRequest(req);
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.userId } });
}

/**
 * Extract authenticated user from request.
 */
export async function getAuthUser(
  request: Request,
): Promise<User | null> {
  const session = await getSessionFromRequest(request as NextRequest);
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.userId } });
}

/**
 * Extracts the authenticated user ID from the request.
 */
export async function getUserId(
  req: NextRequest,
): Promise<string | null> {
  const session = await getSessionFromRequest(req);
  return session?.userId ?? null;
}

/**
 * Middleware-style wrapper for protected route handlers.
 * Extracts user from JWT cookie. Returns 401 if not authenticated.
 */
export async function withAuth(
  req: NextRequest,
  handler: (req: NextRequest, user: User) => Promise<NextResponse>,
): Promise<NextResponse> {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();
  return handler(req, user);
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
