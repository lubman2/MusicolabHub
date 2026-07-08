import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/test/invitations/by-email/:email/token — fetch the latest pending
 * invitation token for an invitee e-mail so e2e can exercise the real
 * accept flow. Gated behind E2E_TEST_MODE=1.
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
  const invitation = await prisma.invitation.findFirst({
    where: { inviteeEmail: email, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { token: true },
  });
  if (!invitation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ token: invitation.token });
}
