import type { MemberRole, UserRole } from "@/generated/prisma";

/**
 * Permission matrix from PRD Role_Lifecycle_Tables.
 * Single source of truth: maps each capability to the project-level roles
 * that have it. Global admins (UserRole.admin) bypass these checks in the
 * authorization helpers (see src/lib/auth.ts) — not listed here.
 */
export const PERMISSIONS = {
  view_project: ["owner", "editor", "commenter", "viewer"],
  download_files: ["owner", "editor", "commenter", "viewer"],
  upload_files: ["owner", "editor"],
  publish_version: ["owner", "editor"],
  create_version: ["owner", "editor"],
  edit_project_metadata: ["owner", "editor"],
  manage_project_lifecycle: ["owner"],
  add_comment: ["owner", "editor", "commenter"],
  delete_own_comment: ["owner", "editor", "commenter"],
  moderate_comments: ["owner"],
  invite_collaborator: ["owner"],
  change_member_role: ["owner"],
  remove_collaborator: ["owner"],
  view_split: ["owner"],
  manage_split: ["owner"],
  delete_published: ["owner"],
} satisfies Record<string, readonly MemberRole[]>;

/**
 * Member roles that API surfaces may grant (invitations, hires, gig
 * applications). Deliberately excludes "owner": a ProjectMember row with
 * role "owner" is treated as owner-equivalent by the permission matrix
 * (see the owner rows above), so granting it would hand out full control.
 * Only Project.ownerId — set at project creation — confers ownership.
 * Guarded by unit tests in rbac.test.ts.
 */
export const GRANTABLE_MEMBER_ROLES = [
  "editor",
  "commenter",
  "viewer",
] as const satisfies readonly MemberRole[];

export type Permission = keyof typeof PERMISSIONS;

/** Pure matrix lookup: does `role` hold `permission`? */
export function can(role: MemberRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly MemberRole[]).includes(role);
}

/**
 * Everything authorizeProjectPermission needs to know, pre-fetched.
 * Null projectOwnerId = project not found; null memberRole = no membership.
 */
export type ProjectAuthzContext = {
  userId: string;
  globalRole: UserRole | null;
  projectOwnerId: string | null;
  memberRole: MemberRole | null;
};

/**
 * Pure authorization decision — the single place the bypass order lives:
 * global admin → project existence → literal owner → membership matrix.
 * Unit-tested branch-by-branch in rbac.test.ts.
 */
export function decideProjectPermission(
  ctx: ProjectAuthzContext,
  permission: Permission,
): boolean {
  if (ctx.globalRole === "admin") return true;
  if (ctx.projectOwnerId === null) return false;
  if (ctx.projectOwnerId === ctx.userId) return true;
  if (ctx.memberRole === null) return false;
  return can(ctx.memberRole, permission);
}
