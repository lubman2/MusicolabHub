import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/test/users/:id — best-effort cleanup of a seeded test user.
 * Gated behind `E2E_TEST_MODE=1`.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { id } = await params;
  try {
    await prisma.user.delete({ where: { id } });
  } catch {
    // already gone — ignore
  }
  return NextResponse.json({ ok: true });
}
