import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  const { email, password } = body as { email: string; password: string };

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  if (user.status === "unverified") {
    return NextResponse.json(
      {
        error: "Account not verified. Please check your email for a verification link.",
        code: "UNVERIFIED",
      },
      { status: 403 },
    );
  }

  if (user.status === "suspended") {
    return NextResponse.json(
      { error: "Account suspended", code: "SUSPENDED" },
      { status: 403 },
    );
  }

  await createSessionCookie({ userId: user.id, role: user.role });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      status: user.status,
      role: user.role,
    },
  });
}
