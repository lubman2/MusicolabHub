import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/email";
import { TRIAL_PERIOD_DAYS } from "@/lib/stripe";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_EXPIRY_HOURS = 24;

// Simple in-memory rate limiter: max 5 signups per IP per 15-minute window
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function validateEmail(email: string): string | null {
  if (!email || typeof email !== "string") return "Email is required";
  if (!EMAIL_RE.test(email)) return "Invalid email format";
  if (email.length > 254) return "Email too long";
  return null;
}

function validatePassword(password: string): string | null {
  if (!password || typeof password !== "string") return "Password is required";
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > 128) return "Password too long";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  return null;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many signup attempts. Try again later." },
      { status: 429 },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const { password } = body;

  const emailError = validateEmail(email ?? "");
  if (emailError) {
    return NextResponse.json({ error: emailError }, { status: 422 });
  }

  const passwordError = validatePassword(password ?? "");
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 422 });
  }

  // Check duplicate email
  const existing = await prisma.user.findUnique({
    where: { email: email! },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password!);
  const verificationToken = randomBytes(VERIFICATION_TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(
    Date.now() + VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000,
  );

  // Calculate trial end date
  const trialEndsAt = new Date(
    Date.now() + TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );

  // Create user, profile stub, email verification, and trial subscription in one transaction
  const user = await prisma.user.create({
    data: {
      email: email!,
      passwordHash,
      status: "unverified",
      profile: {
        create: {},
      },
      emailVerifications: {
        create: {
          token: verificationToken,
          expiresAt,
        },
      },
      subscription: {
        create: {
          plan: "trial",
          status: "trialing",
          trialEndsAt,
        },
      },
    },
    select: { id: true },
  });

  // Send verification email (fire-and-forget — don't block response on SMTP)
  sendVerificationEmail(email!, verificationToken).catch((err) => {
    console.error("Failed to send verification email:", err);
  });

  return NextResponse.json({ userId: user.id }, { status: 201 });
}
