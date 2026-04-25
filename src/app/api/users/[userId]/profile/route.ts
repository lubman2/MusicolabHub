import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAvatarUrl } from "@/lib/profile";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      profile: {
        select: {
          displayName: true,
          headline: true,
          bio: true,
          avatarUrl: true,
          skills: true,
          genres: true,
        },
      },
    },
  });

  if (!user || user.status === "suspended" || user.status === "unverified") {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!user.profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const avatarUrl = await resolveAvatarUrl(user.profile.avatarUrl);

  return NextResponse.json({
    profile: {
      userId: user.id,
      displayName: user.profile.displayName,
      headline: user.profile.headline,
      bio: user.profile.bio,
      avatarUrl,
      skills: user.profile.skills,
      genres: user.profile.genres,
    },
  });
}
