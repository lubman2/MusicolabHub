"use client";

import { useState } from "react";
import { Nav } from "@/components/nav";

const plans = [
  {
    key: "pro",
    name: "Pro",
    description: "For individual creators",
    features: [
      "Unlimited projects",
      "Version control",
      "File sharing",
      "Comment threads",
    ],
  },
  {
    key: "team",
    name: "Team",
    description: "For bands and collaborators",
    features: [
      "Everything in Pro",
      "Team workspaces",
      "Role-based access",
      "Split sheet management",
    ],
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(plan: string) {
    setLoading(plan);
    setError(null);

    try {
      // TODO: replace hardcoded userId with session user when auth is implemented
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "placeholder", plan }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      if (data.url) {
        window.location.assign(data.url);
      }
    } catch {
      setError("Failed to start checkout");
    } finally {
      setLoading(null);
    }
  }

  const canceled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("checkout") === "canceled";

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            Choose your plan
          </h1>
          <p className="mt-2 text-neutral-600">
            Start with a 14-day free trial. No credit card required upfront.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-md bg-red-50 p-4 text-center text-sm text-red-700">
            {error}
          </div>
        )}

        {canceled && (
          <div className="mt-6 rounded-md bg-yellow-50 p-4 text-center text-sm text-yellow-700">
            Checkout was canceled. You can try again anytime.
          </div>
        )}

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {plans.map((plan) => (
            <div
              key={plan.key}
              className="rounded-xl border border-neutral-200 bg-white p-8"
            >
              <h2 className="text-xl font-semibold text-neutral-900">
                {plan.name}
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                {plan.description}
              </p>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-neutral-700"
                  >
                    <span className="mt-0.5 text-neutral-400">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCheckout(plan.key)}
                disabled={loading !== null}
                className="mt-8 w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {loading === plan.key ? "Redirecting..." : "Start free trial"}
              </button>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
