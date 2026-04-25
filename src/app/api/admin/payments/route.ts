import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin";

const ALLOWED_SORTS = ["createdAt", "updatedAt", "currentPeriodEnd"] as const;
const ALLOWED_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
] as const;
const ALLOWED_PLANS = ["trial", "pro", "team"] as const;

type AllowedSort = (typeof ALLOWED_SORTS)[number];
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];
type AllowedPlan = (typeof ALLOWED_PLANS)[number];

/**
 * GET /api/admin/payments
 *
 * Subscription / payment lookup. The platform tracks payments via Stripe
 * subscriptions, so this lists Subscription records with the owning user.
 *
 * Query params:
 *   userId: string  — exact user id match
 *   search: string  — case-insensitive match against user email/displayName
 *   status: SubscriptionStatus
 *   plan:   SubscriptionPlan
 *   page:   number (default 1)
 *   limit:  number (default 25, max 100)
 *   sort:   "createdAt" | "updatedAt" | "currentPeriodEnd" (default "updatedAt")
 *   order:  "asc" | "desc" (default "desc")
 */
export const GET = withAdmin(async (request) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim() ?? "";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const statusParam = url.searchParams.get("status");
  const planParam = url.searchParams.get("plan");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)),
  );
  const sortParam = url.searchParams.get("sort") ?? "updatedAt";
  const sortField: AllowedSort = ALLOWED_SORTS.includes(sortParam as AllowedSort)
    ? (sortParam as AllowedSort)
    : "updatedAt";
  const sortOrder = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  const where: Prisma.SubscriptionWhereInput = {};
  if (userId) {
    where.userId = userId;
  }
  if (search) {
    where.user = {
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        {
          profile: {
            displayName: { contains: search, mode: "insensitive" },
          },
        },
      ],
    };
  }
  if (statusParam && ALLOWED_STATUSES.includes(statusParam as AllowedStatus)) {
    where.status = statusParam as AllowedStatus;
  }
  if (planParam && ALLOWED_PLANS.includes(planParam as AllowedPlan)) {
    where.plan = planParam as AllowedPlan;
  }

  const [subscriptions, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        plan: true,
        status: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        canceledAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
        _count: { select: { events: true } },
      },
    }),
    prisma.subscription.count({ where }),
  ]);

  return NextResponse.json({
    data: subscriptions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});
