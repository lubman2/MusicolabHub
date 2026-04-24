import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const MAX_DISPLAY_NAME = 80;
const MAX_HEADLINE = 120;
const MAX_BIO = 2000;
const MAX_TAG_LENGTH = 40;
const MAX_TAGS = 20;

interface OnboardingBody {
  displayName?: unknown;
  headline?: unknown;
  bio?: unknown;
  skills?: unknown;
  genres?: unknown;
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

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.status === "unverified") {
    return NextResponse.json(
      { error: "Email must be verified before onboarding", code: "UNVERIFIED" },
      { status: 403 },
    );
  }
  if (user.status === "suspended") {
    return NextResponse.json(
      { error: "Account suspended", code: "SUSPENDED" },
      { status: 403 },
    );
  }
  if (user.status === "onboarded") {
    return NextResponse.json(
      { error: "Already onboarded", code: "ALREADY_ONBOARDED" },
      { status: 409 },
    );
  }

  let body: OnboardingBody;
  try {
    body = (await req.json()) as OnboardingBody;
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

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      status: "onboarded",
      profile: {
        upsert: {
          create: {
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
        },
      },
    },
    select: {
      id: true,
      email: true,
      status: true,
      role: true,
      profile: {
        select: {
          displayName: true,
          headline: true,
          bio: true,
          skills: true,
          genres: true,
        },
      },
    },
  });

  return NextResponse.json({ user: updated });
}
