import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/test/users/by-email/:email/verification-token — fetch the latest
 * unused e-mail verification token so e2e can exercise the real
 * /api/auth/verify-email endpoint. Gated behind E2E_TEST_MODE=1.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail);
  const verification = await prisma.emailVerification.findFirst({
    where: { user: { email }, usedAt: null },
    orderBy: { createdAt: "desc" },
    select: { token: true },
  });
  if (!verification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ token: verification.token });
}
