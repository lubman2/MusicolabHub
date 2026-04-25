import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { sendAccountDeleteVerifyEmail } from "@/lib/email";
import { VERIFY_TOKEN_EXPIRY_MINUTES } from "@/lib/account-request";

const VERIFY_TOKEN_BYTES = 32;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password = body.password;
  if (!password || typeof password !== "string") {
    return NextResponse.json(
      { error: "Password confirmation required" },
      { status: 422 },
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: "Incorrect password", code: "BAD_PASSWORD" },
      { status: 401 },
    );
  }

  // Block if there is already an active (non-cancelled, non-completed) delete request.
  const existing = await prisma.accountRequest.findFirst({
    where: {
      userId: user.id,
      type: "delete",
      status: { in: ["pending_verification", "pending"] },
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A delete request is already in progress", code: "EXISTS" },
      { status: 409 },
    );
  }

  const token = randomBytes(VERIFY_TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(
    Date.now() + VERIFY_TOKEN_EXPIRY_MINUTES * 60 * 1000,
  );

  const request = await prisma.accountRequest.create({
    data: {
      userId: user.id,
      type: "delete",
      status: "pending_verification",
      verifyToken: token,
      verifyTokenExpiresAt: expiresAt,
    },
    select: { id: true },
  });

  sendAccountDeleteVerifyEmail(user.email, token).catch((err) => {
    console.error("Failed to send account delete verify email:", err);
  });

  return NextResponse.json({ ok: true, requestId: request.id });
}
