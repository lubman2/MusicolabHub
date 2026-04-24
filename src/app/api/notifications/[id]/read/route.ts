import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, forbidden } from "@/lib/auth";

/**
 * PUT /api/notifications/[id]/read
 * Marks the notification as read. Only the owning user may mark it.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const notification = await prisma.notification.findUnique({
    where: { id },
    select: { id: true, userId: true, isRead: true },
  });

  if (!notification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (notification.userId !== userId) return forbidden();

  if (notification.isRead) {
    return NextResponse.json({ id, isRead: true });
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  return NextResponse.json(updated);
}
