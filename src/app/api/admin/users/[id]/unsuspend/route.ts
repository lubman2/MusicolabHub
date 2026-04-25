import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const MAX_REASON_CODE_LENGTH = 64;
const MAX_INTERNAL_NOTE_LENGTH = 2000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetUserId } = await params;

  const actor = await getAuthUser(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    reasonCode?: unknown;
    internalNote?: unknown;
  } | null;

  const reasonCode =
    typeof body?.reasonCode === "string" ? body.reasonCode.trim() : "";
  const internalNote =
    typeof body?.internalNote === "string" ? body.internalNote.trim() : "";

  if (!reasonCode) {
    return NextResponse.json(
      { error: "reasonCode is required" },
      { status: 400 },
    );
  }
  if (reasonCode.length > MAX_REASON_CODE_LENGTH) {
    return NextResponse.json(
      { error: `reasonCode must be ${MAX_REASON_CODE_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }
  if (internalNote.length > MAX_INTERNAL_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `internalNote must be ${MAX_INTERNAL_NOTE_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      status: true,
      profile: { select: { id: true } },
    },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.status !== "suspended") {
    return NextResponse.json(
      { error: "User is not suspended" },
      { status: 409 },
    );
  }

  // Pre-suspension state isn't stored, so infer from profile presence:
  // a user with a profile completed onboarding; otherwise they were verified.
  const restoredStatus = target.profile ? "onboarded" : "verified";

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { status: restoredStatus },
      select: { id: true, status: true, updatedAt: true },
    }),
    prisma.adminAction.create({
      data: {
        actorId: actor.id,
        actionType: "unsuspend_account",
        targetType: "user",
        targetId: target.id,
        reasonCode,
        internalNote: internalNote || null,
      },
    }),
  ]);

  return NextResponse.json(updated);
}
