import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  MAX_BIO,
  MAX_DISPLAY_NAME,
  MAX_HEADLINE,
  normalizeTags,
  optionalString,
  resolveAvatarUrl,
} from "@/lib/profile";

interface ProfileBody {
  displayName?: unknown;
  headline?: unknown;
  bio?: unknown;
  skills?: unknown;
  genres?: unknown;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
    select: {
      displayName: true,
      headline: true,
      bio: true,
      avatarUrl: true,
      skills: true,
      genres: true,
    },
  });

  const avatarUrl = await resolveAvatarUrl(profile?.avatarUrl);

  return NextResponse.json({
    profile: {
      displayName: profile?.displayName ?? null,
      headline: profile?.headline ?? null,
      bio: profile?.bio ?? null,
      avatarUrl,
      skills: profile?.skills ?? [],
      genres: profile?.genres ?? [],
    },
  });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.status === "unverified") {
    return NextResponse.json(
      { error: "Email must be verified", code: "UNVERIFIED" },
      { status: 403 },
    );
  }
  if (user.status === "suspended") {
    return NextResponse.json(
      { error: "Account suspended", code: "SUSPENDED" },
      { status: 403 },
    );
  }

  let body: ProfileBody;
  try {
    body = (await req.json()) as ProfileBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.displayName !== "string" || !body.displayName.trim()) {
    return NextResponse.json(
      { error: "displayName is required" },
      { status: 422 },
    );
  }
  const displayName = body.displayName.trim();
  if (displayName.length > MAX_DISPLAY_NAME) {
    return NextResponse.json(
      { error: `displayName must be ${MAX_DISPLAY_NAME} characters or fewer` },
      { status: 422 },
    );
  }

  const headlineResult = optionalString(body.headline, "headline", MAX_HEADLINE);
  if (typeof headlineResult === "object" && headlineResult !== null) {
    return NextResponse.json({ error: headlineResult.error }, { status: 422 });
  }
  const headline = headlineResult as string | null;

  const bioResult = optionalString(body.bio, "bio", MAX_BIO);
  if (typeof bioResult === "object" && bioResult !== null) {
    return NextResponse.json({ error: bioResult.error }, { status: 422 });
  }
  const bio = bioResult as string | null;

  const skillsResult = normalizeTags(body.skills);
  if (typeof skillsResult === "string") {
    return NextResponse.json(
      { error: `skills ${skillsResult}` },
      { status: 422 },
    );
  }

  const genresResult = normalizeTags(body.genres);
  if (typeof genresResult === "string") {
    return NextResponse.json(
      { error: `genres ${genresResult}` },
      { status: 422 },
    );
  }

  const updated = await prisma.profile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      displayName,
      headline,
      bio,
      skills: skillsResult,
      genres: genresResult,
    },
    update: {
      displayName,
      headline,
      bio,
      skills: skillsResult,
      genres: genresResult,
    },
    select: {
      displayName: true,
      headline: true,
      bio: true,
      avatarUrl: true,
      skills: true,
      genres: true,
    },
  });

  const avatarUrl = await resolveAvatarUrl(updated.avatarUrl);

  return NextResponse.json({
    profile: {
      displayName: updated.displayName,
      headline: updated.headline,
      bio: updated.bio,
      avatarUrl,
      skills: updated.skills,
      genres: updated.genres,
    },
  });
}
