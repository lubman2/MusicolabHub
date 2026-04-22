import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_EXPIRY_HOURS = 24;

export async function POST(req: NextRequest) {
  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, email: true, status: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.status !== "unverified") {
    return NextResponse.json(
      { error: "Email already verified", code: "ALREADY_VERIFIED" },
      { status: 409 },
    );
  }

  const token = randomBytes(VERIFICATION_TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(
    Date.now() + VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000,
  );

  await prisma.emailVerification.create({
    data: { userId: user.id, token, expiresAt },
  });

  sendVerificationEmail(user.email, token).catch((err) => {
    console.error("Failed to send verification email:", err);
  });

  return NextResponse.json({ ok: true });
}
