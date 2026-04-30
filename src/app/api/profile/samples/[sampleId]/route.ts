import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  validateSampleMimeType,
  validateSampleTitle,
  validateSampleUrl,
} from "@/lib/portfolio-samples";

interface PatchBody {
  title?: unknown;
  url?: unknown;
  mimeType?: unknown;
  sortOrder?: unknown;
}

interface RouteParams {
  params: Promise<{ sampleId: string }>;
}

async function loadSampleForUser(userId: string, sampleId: string) {
  const sample = await prisma.portfolioSample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      profileId: true,
      profile: { select: { userId: true } },
    },
  });
  if (!sample || sample.profile.userId !== userId) return null;
  return sample;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
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

  const { sampleId } = await params;
  const existing = await loadSampleForUser(user.id, sampleId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: {
    title?: string;
    url?: string;
    mimeType?: string | null;
    sortOrder?: number;
  } = {};

  if (body.title !== undefined) {
    const result = validateSampleTitle(body.title);
    if (typeof result === "object") {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    data.title = result;
  }

  if (body.url !== undefined) {
    const result = validateSampleUrl(body.url);
    if (typeof result === "object") {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    data.url = result;
  }

  if (body.mimeType !== undefined) {
    const result = validateSampleMimeType(body.mimeType);
    if (typeof result === "object" && result !== null) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    data.mimeType = result;
  }

  if (body.sortOrder !== undefined) {
    if (
      typeof body.sortOrder !== "number" ||
      !Number.isInteger(body.sortOrder) ||
      body.sortOrder < 0
    ) {
      return NextResponse.json(
        { error: "sortOrder must be a non-negative integer" },
        { status: 422 },
      );
    }
    data.sortOrder = body.sortOrder;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No updatable fields provided" },
      { status: 422 },
    );
  }

  const sample = await prisma.portfolioSample.update({
    where: { id: existing.id },
    data,
    select: {
      id: true,
      title: true,
      url: true,
      mimeType: true,
      sortOrder: true,
    },
  });

  return NextResponse.json({ sample });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.status === "suspended") {
    return NextResponse.json(
      { error: "Account suspended", code: "SUSPENDED" },
      { status: 403 },
    );
  }

  const { sampleId } = await params;
  const existing = await loadSampleForUser(user.id, sampleId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.portfolioSample.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
