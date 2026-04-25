import { NextRequest, NextResponse } from "next/server";
import { runTrialExpirySweep } from "@/lib/trial-expiry";

/**
 * POST /api/cron/expire-trials
 *
 * Sweeps trialing subscriptions: marks expired ones, sends "ending soon" emails
 * 3 days out, and sends "expired" emails on the day of expiration.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` header.
 * Intended to run daily via an external scheduler (Vercel Cron, GitHub Actions, etc.).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTrialExpirySweep();
  return NextResponse.json({ ok: true, ...result });
}
