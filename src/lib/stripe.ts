import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

export const PLANS = {
  pro: {
    name: "Pro",
    description: "Individual creator plan",
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
  },
  team: {
    name: "Team",
    description: "Team collaboration plan",
    priceId: process.env.STRIPE_TEAM_PRICE_ID!,
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export const TRIAL_PERIOD_DAYS = 14;
