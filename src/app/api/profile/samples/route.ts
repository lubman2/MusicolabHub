import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  MAX_PORTFOLIO_SAMPLES,
  validateSampleMimeType,
  validateSampleTitle,
  validateSampleUrl,
} from "@/lib/portfolio-samples";

interface SampleBody {
  title?: unknown;
  url?: unknown;
  mimeType?: unknown;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!profile) {
    return NextResponse.json({ samples: [] });
  }

  const samples = await prisma.portfolioSample.findMany({
    where: { profileId: profile.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      url: true,
      mimeType: true,
      sortOrder: true,
    },
  });

  return NextResponse.json({ samples });
}

export async function POST(req: NextRequest) {
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

  let body: SampleBody;
  try {
    body = (await req.json()) as SampleBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const titleResult = validateSampleTitle(body.title);
  if (typeof titleResult === "object") {
    return NextResponse.json({ error: titleResult.error }, { status: 422 });
  }

  const urlResult = validateSampleUrl(body.url);
  if (typeof urlResult === "object") {
    return NextResponse.json({ error: urlResult.error }, { status: 422 });
  }

  const mimeResult = validateSampleMimeType(body.mimeType);
  if (typeof mimeResult === "object" && mimeResult !== null) {
    return NextResponse.json({ error: mimeResult.error }, { status: 422 });
  }

  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
    select: { id: true },
  });

  const count = await prisma.portfolioSample.count({
    where: { profileId: profile.id },
  });
  if (count >= MAX_PORTFOLIO_SAMPLES) {
    return NextResponse.json(
      {
        error: `At most ${MAX_PORTFOLIO_SAMPLES} portfolio samples allowed`,
        code: "LIMIT_REACHED",
      },
      { status: 422 },
    );
  }

  const sample = await prisma.portfolioSample.create({
    data: {
      profileId: profile.id,
      title: titleResult,
      url: urlResult,
      mimeType: mimeResult,
      sortOrder: count,
    },
    select: {
      id: true,
      title: true,
      url: true,
      mimeType: true,
      sortOrder: true,
    },
  });

  return NextResponse.json({ sample }, { status: 201 });
}
