import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const GENRE_MAX = 100;
const TAG_MAX_LENGTH = 50;
const TAGS_MAX_COUNT = 20;
const COVER_IMAGE_URL_MAX = 2048;

const PROJECT_SELECT = {
  id: true,
  ownerId: true,
  title: true,
  description: true,
  genre: true,
  tags: true,
  coverImageUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function loadAuthorizedProject(
  projectId: string,
  userId: string,
  requireEditor: boolean,
): Promise<
  | { ok: true; project: { ownerId: string } }
  | { ok: false; status: number; error: string }
> {
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active", deletedAt: null },
    select: { ownerId: true },
  });

  if (!project) {
    return { ok: false, status: 404, error: "Project not found" };
  }

  const isOwner = project.ownerId === userId;
  if (isOwner) return { ok: true, project };

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });

  if (!membership) {
    return { ok: false, status: 404, error: "Project not found" };
  }

  if (requireEditor) {
    const canEdit =
      membership.role === "editor" || membership.role === "owner";
    if (!canEdit) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
  }

  return { ok: true, project };
}

/** GET /api/projects/[id] — fetch project metadata (any member). */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const auth = await loadAuthorizedProject(projectId, user.id, false);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: PROJECT_SELECT,
  });

  return NextResponse.json(project);
}

/** PUT /api/projects/[id] — update project metadata (owner + editor). */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const auth = await loadAuthorizedProject(projectId, user.id, true);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    title?: unknown;
    description?: unknown;
    genre?: unknown;
    tags?: unknown;
    coverImageUrl?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: {
    title?: string;
    description?: string | null;
    genre?: string | null;
    tags?: string[];
    coverImageUrl?: string | null;
  } = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string") {
      return NextResponse.json(
        { error: "title must be a string" },
        { status: 400 },
      );
    }
    const trimmed = body.title.trim();
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "title cannot be empty" },
        { status: 400 },
      );
    }
    if (trimmed.length > TITLE_MAX) {
      return NextResponse.json(
        { error: `title must be at most ${TITLE_MAX} characters` },
        { status: 400 },
      );
    }
    data.title = trimmed;
  }

  if (body.description !== undefined) {
    if (body.description === null) {
      data.description = null;
    } else if (typeof body.description !== "string") {
      return NextResponse.json(
        { error: "description must be a string or null" },
        { status: 400 },
      );
    } else if (body.description.length > DESCRIPTION_MAX) {
      return NextResponse.json(
        { error: `description must be at most ${DESCRIPTION_MAX} characters` },
        { status: 400 },
      );
    } else {
      data.description = body.description;
    }
  }

  if (body.genre !== undefined) {
    if (body.genre === null) {
      data.genre = null;
    } else if (typeof body.genre !== "string") {
      return NextResponse.json(
        { error: "genre must be a string or null" },
        { status: 400 },
      );
    } else {
      const trimmed = body.genre.trim();
      if (trimmed.length === 0) {
        data.genre = null;
      } else if (trimmed.length > GENRE_MAX) {
        return NextResponse.json(
          { error: `genre must be at most ${GENRE_MAX} characters` },
          { status: 400 },
        );
      } else {
        data.genre = trimmed;
      }
    }
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      return NextResponse.json(
        { error: "tags must be an array of strings" },
        { status: 400 },
      );
    }
    if (body.tags.length > TAGS_MAX_COUNT) {
      return NextResponse.json(
        { error: `tags must contain at most ${TAGS_MAX_COUNT} entries` },
        { status: 400 },
      );
    }
    const normalized: string[] = [];
    for (const tag of body.tags) {
      if (typeof tag !== "string") {
        return NextResponse.json(
          { error: "tags must be an array of strings" },
          { status: 400 },
        );
      }
      const trimmed = tag.trim();
      if (trimmed.length === 0) continue;
      if (trimmed.length > TAG_MAX_LENGTH) {
        return NextResponse.json(
          { error: `each tag must be at most ${TAG_MAX_LENGTH} characters` },
          { status: 400 },
        );
      }
      if (!normalized.includes(trimmed)) normalized.push(trimmed);
    }
    data.tags = normalized;
  }

  if (body.coverImageUrl !== undefined) {
    if (body.coverImageUrl === null) {
      data.coverImageUrl = null;
    } else if (typeof body.coverImageUrl !== "string") {
      return NextResponse.json(
        { error: "coverImageUrl must be a string or null" },
        { status: 400 },
      );
    } else {
      const trimmed = body.coverImageUrl.trim();
      if (trimmed.length === 0) {
        data.coverImageUrl = null;
      } else if (trimmed.length > COVER_IMAGE_URL_MAX) {
        return NextResponse.json(
          {
            error: `coverImageUrl must be at most ${COVER_IMAGE_URL_MAX} characters`,
          },
          { status: 400 },
        );
      } else {
        try {
          const parsed = new URL(trimmed);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return NextResponse.json(
              { error: "coverImageUrl must be an http(s) URL" },
              { status: 400 },
            );
          }
        } catch {
          return NextResponse.json(
            { error: "coverImageUrl must be a valid URL" },
            { status: 400 },
          );
        }
        data.coverImageUrl = trimmed;
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "no editable fields supplied" },
      { status: 400 },
    );
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data,
    select: PROJECT_SELECT,
  });

  return NextResponse.json(updated);
}
