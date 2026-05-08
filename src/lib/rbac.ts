import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { prisma } from "./prisma";
import type { User, ProjectMember, MemberRole } from "@/generated/prisma";

/**
 * Permission matrix from PRD Role_Lifecycle_Tables.
 * Maps each capability to the project-level roles that have it.
 * Admin (UserRole.admin) bypasses all checks — not listed here.
 */
export const PERMISSIONS = {
  view_project: ["owner", "editor", "commenter", "viewer"] as const,
  download_files: ["owner", "editor", "commenter", "viewer"] as const,
  upload_files: ["owner", "editor"] as const,
  publish_version: ["owner", "editor"] as const,
  edit_project_metadata: ["owner", "editor"] as const,
  add_comment: ["owner", "editor", "commenter"] as const,
  delete_own_comment: ["owner", "editor", "commenter"] as const,
  moderate_comments: ["owner"] as const,
  invite_collaborator: ["owner"] as const,
  change_member_role: ["owner"] as const,
  remove_collaborator: ["owner"] as const,
  view_split: ["owner"] as const,
  manage_split: ["owner"] as const,
  delete_published: ["owner"] as const,
} satisfies Record<string, readonly MemberRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export type AuthContext = {
  user: User;
  member: ProjectMember | null; // null when admin override
  projectId: string;
};

type AuthenticatedHandler = (
  req: NextRequest,
  ctx: AuthContext,
) => Promise<NextResponse> | NextResponse;

type RouteContext = {
  params: Promise<Record<string, string>>;
};

/**
 * RBAC middleware for project-scoped API routes.
 *
 * Expects the route to have a [projectId] dynamic segment.
 *
 * Flow:
 * 1. Authenticate user → 401 if not logged in
 * 2. Admin override → skip membership check
 * 3. Lookup ProjectMember → 404 if not a member (info-leak prevention)
 * 4. Check role against requiredRoles → 403 if insufficient
 *
 * Usage:
 *   export const GET = withProjectAuth(PERMISSIONS.upload_files, async (req, ctx) => {
 *     // ctx.user, ctx.member, ctx.projectId available
 *     return NextResponse.json({ ok: true });
 *   });
 */
export function withProjectAuth(
  requiredRoles: readonly MemberRole[],
  handler: AuthenticatedHandler,
) {
  return async (req: NextRequest, routeCtx: RouteContext) => {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await routeCtx.params;
    const projectId = params.projectId;

    if (!projectId) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    // Admin override: platform admins bypass project membership checks
    if (user.role === "admin") {
      return handler(req, { user, member: null, projectId });
    }

    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });

    // Non-member → 404 (prevents leaking whether the project exists)
    if (!member) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Role check
    if (!requiredRoles.includes(member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return handler(req, { user, member, projectId });
  };
}
