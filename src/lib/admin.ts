import { NextRequest, NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";

export type AdminContext = {
  user: User;
};

type AdminHandler = (
  req: NextRequest,
  ctx: AdminContext,
) => Promise<NextResponse> | NextResponse;

/**
 * Middleware for admin-only API routes.
 *
 * Returns 401 when the request is unauthenticated and 403 when the
 * authenticated user is not a platform admin (UserRole.admin).
 */
export function withAdmin(handler: AdminHandler) {
  return async (req: NextRequest) => {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return handler(req, { user });
  };
}

/**
 * Server component / route helper that loads the authenticated user and
 * enforces admin role. Unauthenticated callers are redirected to /login.
 * Returns null for authenticated non-admins so the caller can render a 403.
 */
export async function loadAdminUser(): Promise<User | null> {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });
  if (!user) redirect("/login");
  if (user.role !== "admin") return null;
  return user;
}
