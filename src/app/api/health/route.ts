import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckStatus = "ok" | "fail" | "skipped";
type CheckResult = { status: CheckStatus; detail?: string };

async function checkDatabase(): Promise<CheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  } catch (err) {
    return {
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function checkEnv(): CheckResult {
  const required = [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "APP_URL",
    "AWS_S3_BUCKET",
    "AWS_REGION",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length === 0) return { status: "ok" };
  return { status: "fail", detail: `missing: ${missing.join(", ")}` };
}

export async function GET() {
  const startedAt = Date.now();
  const [database, env] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkEnv()),
  ]);

  const ok = database.status === "ok" && env.status === "ok";

  return NextResponse.json(
    {
      ok,
      checks: { database, env },
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
      env_name: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      duration_ms: Date.now() - startedAt,
    },
    { status: ok ? 200 : 503 },
  );
}
