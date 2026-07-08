import { NextRequest, NextResponse } from "next/server";
import { runSoftDeletePurgeSweep } from "@/lib/soft-delete-purge";

async function handle(req: NextRequest) {
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

  const result = await runSoftDeletePurgeSweep();
  return NextResponse.json({ ok: true, ...result });
}

// Vercel Cron invokes the route as GET with `Authorization: Bearer $CRON_SECRET`
// when CRON_SECRET is set in project env. Manual / external schedulers may POST.
export const GET = handle;
export const POST = handle;
