import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

/**
 * POST /api/test/users — seed a verified+onboarded user for E2E tests.
 *
 * Gated behind `E2E_TEST_MODE=1`. Returns 404 in any other environment so
 * the route effectively does not exist in production.
 *
 * Body (all optional):
 *   { email?, password?, displayName? }
 *
 * Response: 201 { id, email, password, displayName }
 */
export async function POST(request: Request) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: {
    email?: string;
    password?: string;
    displayName?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — defaults below
  }

  const stamp =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email = body.email ?? `e2e-${stamp}@e2e.test`;
  const password = body.password ?? "E2eTest1234!";
  const displayName = body.displayName ?? `E2E ${stamp}`;
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      status: "onboarded",
      profile: { create: { displayName } },
      subscription: {
        create: {
          plan: "trial",
          status: "trialing",
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      },
    },
    select: { id: true },
  });

  return NextResponse.json(
    { id: user.id, email, password, displayName },
    { status: 201 },
  );
}
