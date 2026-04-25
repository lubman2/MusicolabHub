import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { resolveAvatarUrl } from "@/lib/profile";

const MAX_DISPLAY_NAME = 80;
const MAX_HEADLINE = 120;
const MAX_BIO = 2000;
const MAX_TAG_LENGTH = 40;
const MAX_TAGS = 20;

interface ProfileBody {
  displayName?: unknown;
  headline?: unknown;
  bio?: unknown;
  skills?: unknown;
  genres?: unknown;
  avatarKey?: unknown;
}

function normalizeTags(value: unknown): string[] | string {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return "must be an array of strings";
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return "must contain only strings";
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_TAG_LENGTH) {
      return `each entry must be ${MAX_TAG_LENGTH} characters or fewer`;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length > MAX_TAGS) {
      return `at most ${MAX_TAGS} entries allowed`;
    }
  }
  return out;
}

function optionalString(
  value: unknown,
  field: string,
  max: number,
): string | null | { error: string } {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return { error: `${field} must be a string` };
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    return { error: `${field} must be ${max} characters or fewer` };
  }
  return trimmed;
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

  if (!profile) {
    return NextResponse.json({
      profile: {
        displayName: null,
        headline: null,
        bio: null,
        avatarUrl: null,
        avatarKey: null,
        skills: [],
        genres: [],
      },
    });
  }

  const avatarUrl = await resolveAvatarUrl(profile.avatarUrl);

  return NextResponse.json({
    profile: {
      displayName: profile.displayName,
      headline: profile.headline,
      bio: profile.bio,
      avatarUrl,
      avatarKey: profile.avatarUrl,
      skills: profile.skills,
      genres: profile.genres,
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

  let avatarKey: string | null | undefined;
  if (body.avatarKey === undefined) {
    avatarKey = undefined;
  } else if (body.avatarKey === null) {
    avatarKey = null;
  } else if (typeof body.avatarKey === "string") {
    const trimmed = body.avatarKey.trim();
    if (!trimmed) {
      avatarKey = null;
    } else if (!trimmed.startsWith(`avatars/${user.id}/`)) {
      return NextResponse.json(
        { error: "avatarKey is invalid" },
        { status: 422 },
      );
    } else {
      avatarKey = trimmed;
    }
  } else {
    return NextResponse.json(
      { error: "avatarKey must be a string or null" },
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
      ...(avatarKey !== undefined && { avatarUrl: avatarKey }),
    },
    update: {
      displayName,
      headline,
      bio,
      skills: skillsResult,
      genres: genresResult,
      ...(avatarKey !== undefined && { avatarUrl: avatarKey }),
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
      avatarKey: updated.avatarUrl,
      skills: updated.skills,
      genres: updated.genres,
    },
  });
}
