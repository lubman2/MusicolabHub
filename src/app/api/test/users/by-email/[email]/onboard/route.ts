import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/test/users/by-email/:email/onboard — flip a user's status to
 * `onboarded` without going through the email-verification link.
 *
 * Workaround for the missing /api/auth/verify-email endpoint. Gated behind
 * `E2E_TEST_MODE=1`. Returns the user id so the test can clean up later.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail);
  const user = await prisma.user.update({
    where: { email },
    data: { status: "onboarded" },
    select: { id: true },
  });
  return NextResponse.json({ id: user.id });
}
