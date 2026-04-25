import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildExportPayload } from "@/lib/account-request";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Block if there is already an in-flight export request.
  const inFlight = await prisma.accountRequest.findFirst({
    where: {
      userId: user.id,
      type: "export",
      status: { in: ["pending", "processing"] },
    },
    select: { id: true },
  });
  if (inFlight) {
    return NextResponse.json(
      { error: "An export request is already in progress", code: "EXISTS" },
      { status: 409 },
    );
  }

  const request = await prisma.accountRequest.create({
    data: {
      userId: user.id,
      type: "export",
      status: "processing",
    },
    select: { id: true },
  });

  try {
    const payload = await buildExportPayload(user.id);
    await prisma.accountRequest.update({
      where: { id: request.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        exportPayload: payload,
      },
    });
  } catch (err) {
    console.error("Export generation failed:", err);
    await prisma.accountRequest.update({
      where: { id: request.id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
    return NextResponse.json(
      { error: "Export generation failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, requestId: request.id });
}
