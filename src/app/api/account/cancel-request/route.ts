import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, forbidden } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  let body: { requestId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requestId = body.requestId;
  if (!requestId || typeof requestId !== "string") {
    return NextResponse.json({ error: "requestId required" }, { status: 422 });
  }

  const request = await prisma.accountRequest.findUnique({
    where: { id: requestId },
    select: { id: true, userId: true, status: true },
  });

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (request.userId !== userId) return forbidden();

  if (
    request.status !== "pending" &&
    request.status !== "pending_verification"
  ) {
    return NextResponse.json(
      { error: "Request is not cancellable", code: "NOT_CANCELLABLE" },
      { status: 409 },
    );
  }

  await prisma.accountRequest.update({
    where: { id: requestId },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      verifyToken: null,
      verifyTokenExpiresAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}
