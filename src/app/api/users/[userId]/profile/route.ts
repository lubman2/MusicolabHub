import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/users/[userId]/profile — public profile data.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      profile: {
        select: {
          displayName: true,
          headline: true,
          bio: true,
          avatarUrl: true,
          skills: true,
          genres: true,
          priceRange: true,
        },
      },
    },
  });

  if (!user || !user.profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    profile: user.profile,
  });
}
