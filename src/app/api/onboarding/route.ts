import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, createSessionCookie } from "@/lib/session";

interface OnboardingBody {
  displayName: string;
  headline?: string;
  bio?: string;
  skills?: string[];
  genres?: string[];
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { status: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.status !== "verified") {
    return NextResponse.json(
      { error: "Only verified users can complete onboarding" },
      { status: 403 },
    );
  }

  let body: Partial<OnboardingBody>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { displayName, headline, bio, skills, genres } = body;

  if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
    return NextResponse.json(
      { error: "displayName is required" },
      { status: 422 },
    );
  }

  if (displayName.length > 100) {
    return NextResponse.json(
      { error: "displayName too long (max 100 chars)" },
      { status: 422 },
    );
  }

  if (headline && headline.length > 200) {
    return NextResponse.json(
      { error: "headline too long (max 200 chars)" },
      { status: 422 },
    );
  }

  if (bio && bio.length > 2000) {
    return NextResponse.json(
      { error: "bio too long (max 2000 chars)" },
      { status: 422 },
    );
  }

  if (skills && !Array.isArray(skills)) {
    return NextResponse.json(
      { error: "skills must be an array" },
      { status: 422 },
    );
  }

  if (genres && !Array.isArray(genres)) {
    return NextResponse.json(
      { error: "genres must be an array" },
      { status: 422 },
    );
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: session.userId },
      data: { status: "onboarded" },
      select: { id: true, role: true },
    });

    await tx.profile.update({
      where: { userId: session.userId },
      data: {
        displayName: displayName.trim(),
        headline: headline?.trim() || null,
        bio: bio?.trim() || null,
        skills: skills || [],
        genres: genres || [],
      },
    });

    return user;
  });

  // Re-sign session with new status
  await createSessionCookie({
    userId: updatedUser.id,
    role: updatedUser.role,
    status: "onboarded",
  });

  return NextResponse.json({ success: true });
}
