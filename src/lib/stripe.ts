import Stripe from "stripe";

let _stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-05-27.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

export function getPlans() {
  return {
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
}

export type PlanKey = "pro" | "team";

export const TRIAL_PERIOD_DAYS = 14;
