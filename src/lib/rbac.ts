import type { MemberRole } from "@/generated/prisma";

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
  edit_project_metadata: ["owner", "editor"],
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

export type Permission = keyof typeof PERMISSIONS;

/** Pure matrix lookup: does `role` hold `permission`? */
export function can(role: MemberRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly MemberRole[]).includes(role);
}
