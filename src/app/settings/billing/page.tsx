import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { BillingActions } from "./billing-actions";

export const dynamic = "force-dynamic";

export default async function BillingSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, status: true },
  });

  if (!user) redirect("/login");
  if (user.status === "unverified") redirect("/login");
  if (user.status === "suspended") redirect("/login");

  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
    select: {
      plan: true,
      status: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      canceledAt: true,
      stripeCustomerId: true,
    },
  });

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <header>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage your subscription, payment method, and billing history.
          </p>
        </header>

        <div className="mt-8">
          <BillingActions
            subscription={
              subscription
                ? {
                    plan: subscription.plan,
                    status: subscription.status,
                    trialEndsAt:
                      subscription.trialEndsAt?.toISOString() ?? null,
                    currentPeriodEnd:
                      subscription.currentPeriodEnd?.toISOString() ?? null,
                    canceledAt:
                      subscription.canceledAt?.toISOString() ?? null,
                    hasStripeCustomer: Boolean(subscription.stripeCustomerId),
                  }
                : null
            }
          />
        </div>
      </main>
    </>
  );
}
