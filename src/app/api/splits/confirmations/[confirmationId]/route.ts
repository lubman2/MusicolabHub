import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type RouteParams = { params: Promise<{ confirmationId: string }> };

/** GET /api/splits/confirmations/[confirmationId] — view confirmation with split details */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { confirmationId } = await params;

  const confirmation = await prisma.splitConfirmation.findUnique({
    where: { id: confirmationId },
    include: {
      splitContributor: {
        include: {
          user: { select: { id: true, email: true } },
          splitRecord: {
            include: {
              project: { select: { id: true, title: true } },
              createdBy: { select: { id: true, email: true } },
              contributors: {
                include: {
                  user: { select: { id: true, email: true } },
                  confirmation: true,
                },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!confirmation) {
    return NextResponse.json(
      { error: "Confirmation not found" },
      { status: 404 },
    );
  }

  // Only the contributor themselves can view their confirmation
  if (confirmation.splitContributor.userId !== user.id) {
    return NextResponse.json(
      { error: "You are not the contributor for this confirmation" },
      { status: 403 },
    );
  }

  return NextResponse.json(confirmation);
}
