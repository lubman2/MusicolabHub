import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

interface ProfileBody {
  displayName?: string;
  headline?: string;
  bio?: string;
  avatarUrl?: string;
  skills?: string[];
  genres?: string[];
  priceRange?: string;
}

function normalizeOptionalString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeStringList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

/**
 * GET /api/profile — current user profile for editing.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
  });

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json(profile);
}

/**
 * PUT /api/profile — update current user profile.
 */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ProfileBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const displayName = normalizeOptionalString(body.displayName, 80);
  const headline = normalizeOptionalString(body.headline, 140);
  const bio = normalizeOptionalString(body.bio, 2000);
  const avatarUrl = normalizeOptionalString(body.avatarUrl, 500);
  const priceRange = normalizeOptionalString(body.priceRange, 80);
  const skills = normalizeStringList(body.skills, 20);
  const genres = normalizeStringList(body.genres, 20);

  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    update: {
      displayName,
      headline,
      bio,
      avatarUrl,
      priceRange,
      skills,
      genres,
    },
    create: {
      userId: user.id,
      displayName,
      headline,
      bio,
      avatarUrl,
      priceRange,
      skills,
      genres,
    },
  });

  return NextResponse.json(profile);
}
