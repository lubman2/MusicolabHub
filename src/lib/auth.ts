import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import type { User } from "@/generated/prisma/client";

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
