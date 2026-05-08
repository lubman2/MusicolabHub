import type { HireStatus, MemberRole, Prisma } from "@/generated/prisma";

export const HIRE_DELIVERY_NOTE_MAX = 10_000;
export const HIRE_CANCEL_REASON_MAX = 2_000;

/**
 * Member roles the buyer may assign to a hired talent. Owner is
 * deliberately excluded — hiring never transfers project ownership.
 */
export const HIRE_GRANTABLE_ROLES = ["viewer", "commenter", "editor"] as const;
export type HireGrantableRole = (typeof HIRE_GRANTABLE_ROLES)[number];

export const HIRE_PUBLIC_SELECT = {
  id: true,
  gigId: true,
  applicationId: true,
  buyerId: true,
  talentId: true,
  agreedFee: true,
  feeCurrency: true,
  status: true,
  startedAt: true,
  deliveredAt: true,
  approvedAt: true,
  cancelledAt: true,
  deliveryNote: true,
  cancelReason: true,
  memberRole: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.HireSelect;

/**
 * State machine for hire/delivery status. Returns the allowed transitions
 * irrespective of actor — the route enforces who may invoke each move.
 *
 * awaiting_start → in_progress | cancelled
 * in_progress    → delivered   | cancelled
 * delivered      → approved    | cancelled
 * approved       → (terminal)
 * cancelled      → (terminal)
 */
export function canTransitionHireStatus(
  from: HireStatus,
  to: HireStatus,
): boolean {
  if (from === to) return false;
  if (from === "approved" || from === "cancelled") return false;
  if (to === "cancelled") return true;
  if (from === "awaiting_start") return to === "in_progress";
  if (from === "in_progress") return to === "delivered";
  if (from === "delivered") return to === "approved";
  return false;
}

export function isGrantableMemberRole(
  role: MemberRole,
): role is HireGrantableRole {
  return (HIRE_GRANTABLE_ROLES as readonly MemberRole[]).includes(role);
}
