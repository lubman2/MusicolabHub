import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/test/projects/:id/files/latest — fetch the most recently created
 * `ready` ProjectFile id for a project. Used by the E2E suite to grab the
 * file id of an upload it just performed via the UI.
 *
 * Gated behind `E2E_TEST_MODE=1`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { id: projectId } = await params;
  const file = await prisma.projectFile.findFirst({
    where: { projectId, status: "ready" },
    orderBy: { createdAt: "desc" },
    select: { id: true, originalName: true, status: true },
  });
  if (!file) {
    return NextResponse.json({ error: "No ready file found" }, { status: 404 });
  }
  return NextResponse.json(file);
}
