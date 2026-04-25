import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const requests = await prisma.accountRequest.findMany({
    where: { userId },
    select: {
      id: true,
      type: true,
      status: true,
      verifiedAt: true,
      scheduledFor: true,
      completedAt: true,
      cancelledAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ requests });
}
