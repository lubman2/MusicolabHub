import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, forbidden } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const request = await prisma.accountRequest.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      type: true,
      status: true,
      exportPayload: true,
    },
  });

  if (!request || request.type !== "export") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (request.userId !== userId) return forbidden();
  if (request.status !== "completed" || !request.exportPayload) {
    return NextResponse.json(
      { error: "Export not ready" },
      { status: 409 },
    );
  }

  const body = JSON.stringify(request.exportPayload, null, 2);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="account-export-${id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
