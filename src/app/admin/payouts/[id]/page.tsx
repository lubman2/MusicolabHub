import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AdminPayoutActions } from "./admin-payout-actions";

export const dynamic = "force-dynamic";

type PayoutStatus =
  | "blocked"
  | "scheduled"
  | "in_transit"
  | "paid"
  | "failed"
  | "reversed";

const STATUS_LABELS: Record<PayoutStatus, { label: string; tone: string }> = {
  blocked: { label: "Blocked", tone: "bg-red-100 text-red-800" },
  scheduled: { label: "Scheduled", tone: "bg-blue-100 text-blue-800" },
  in_transit: { label: "In transit", tone: "bg-amber-100 text-amber-800" },
  paid: { label: "Paid", tone: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", tone: "bg-red-100 text-red-800" },
  reversed: { label: "Reversed", tone: "bg-neutral-200 text-neutral-700" },
};

function formatAmount(amount: number, currency: string) {
  return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function formatDateTime(value: Date | null) {
  if (!value) return "—";
  return value.toLocaleString();
}

export default async function AdminPayoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const payout = await prisma.payoutRecord.findUnique({
    where: { id },
    select: {
      id: true,
      paymentId: true,
      talentId: true,
      amount: true,
      currency: true,
      status: true,
      blockReason: true,
      stripeTransferId: true,
      scheduledFor: true,
      autoReleaseAt: true,
      releasedAt: true,
      paidAt: true,
      failedAt: true,
      failureCode: true,
      failureMessage: true,
      heldAt: true,
      heldByActorId: true,
      reversedAt: true,
      createdAt: true,
      updatedAt: true,
      payment: {
        select: {
          id: true,
          hireId: true,
          amount: true,
          currency: true,
          platformFee: true,
          status: true,
          paidAt: true,
          buyer: {
            select: {
              id: true,
              email: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      },
      talent: {
        select: {
          id: true,
          email: true,
          profile: { select: { displayName: true } },
          connectAccount: {
            select: {
              status: true,
              payoutsEnabled: true,
              stripeAccountId: true,
              disabledReason: true,
            },
          },
        },
      },
    },
  });

  if (!payout) notFound();

  const recentActions = await prisma.adminAction.findMany({
    where: { targetType: "payout", targetId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      actionType: true,
      reasonCode: true,
      internalNote: true,
      createdAt: true,
      actor: { select: { email: true } },
    },
  });

  const statusMeta = STATUS_LABELS[payout.status];
  const talentName =
    payout.talent.profile?.displayName ?? payout.talent.email;
  const buyerName =
    payout.payment.buyer.profile?.displayName ?? payout.payment.buyer.email;

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/payouts"
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            ← Payouts
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">
            Payout {payout.id}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Talent:{" "}
            <Link
              href={`/admin/users/${payout.talent.id}`}
              className="underline-offset-2 hover:underline"
            >
              {talentName}
            </Link>{" "}
            · Buyer:{" "}
            <Link
              href={`/admin/users/${payout.payment.buyer.id}`}
              className="underline-offset-2 hover:underline"
            >
              {buyerName}
            </Link>
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.tone}`}
        >
          {statusMeta.label}
        </span>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900">Payout</h2>
          <dl className="mt-3 space-y-2 text-sm text-neutral-700">
            <Row label="Amount" value={formatAmount(payout.amount, payout.currency)} />
            <Row label="Block reason" value={payout.blockReason ?? "—"} />
            <Row label="Scheduled for" value={formatDateTime(payout.scheduledFor)} />
            <Row label="Auto-release at" value={formatDateTime(payout.autoReleaseAt)} />
            <Row label="Released at" value={formatDateTime(payout.releasedAt)} />
            <Row label="Paid at" value={formatDateTime(payout.paidAt)} />
            <Row label="Held at" value={formatDateTime(payout.heldAt)} />
            <Row
              label="Stripe transfer"
              value={payout.stripeTransferId ?? "—"}
            />
            {payout.failureCode || payout.failureMessage ? (
              <Row
                label="Failure"
                value={`${payout.failureCode ?? ""} ${payout.failureMessage ?? ""}`.trim() || "—"}
              />
            ) : null}
          </dl>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900">
            Buyer payment
          </h2>
          <dl className="mt-3 space-y-2 text-sm text-neutral-700">
            <Row
              label="Hire"
              value={
                <Link
                  href={`/admin/users/${payout.payment.buyer.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {payout.payment.hireId}
                </Link>
              }
            />
            <Row
              label="Charged"
              value={formatAmount(payout.payment.amount, payout.payment.currency)}
            />
            <Row
              label="Platform fee"
              value={formatAmount(
                payout.payment.platformFee,
                payout.payment.currency,
              )}
            />
            <Row label="Status" value={payout.payment.status} />
            <Row
              label="Paid at"
              value={formatDateTime(payout.payment.paidAt)}
            />
          </dl>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">
          Connect account
        </h2>
        {payout.talent.connectAccount ? (
          <dl className="mt-3 grid gap-2 text-sm text-neutral-700 sm:grid-cols-2">
            <Row
              label="Status"
              value={payout.talent.connectAccount.status}
            />
            <Row
              label="Payouts enabled"
              value={payout.talent.connectAccount.payoutsEnabled ? "Yes" : "No"}
            />
            <Row
              label="Stripe account"
              value={payout.talent.connectAccount.stripeAccountId ?? "—"}
            />
            <Row
              label="Disabled reason"
              value={payout.talent.connectAccount.disabledReason ?? "—"}
            />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">
            Talent has not started Connect onboarding.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">
          Moderation actions
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Hold places an admin block on the payout. Release clears the admin
          hold and either schedules or transfers depending on Connect status.
        </p>
        <div className="mt-4">
          <AdminPayoutActions
            payoutId={payout.id}
            status={payout.status}
            blockReason={payout.blockReason}
            paymentSucceeded={payout.payment.status === "succeeded"}
          />
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">
          Recent admin actions
        </h2>
        {recentActions.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            No admin actions recorded for this payout.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {recentActions.map((action) => (
              <li
                key={action.id}
                className="flex items-start justify-between gap-4 py-3 text-sm"
              >
                <div>
                  <div className="font-medium text-neutral-900">
                    {action.actionType.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {action.actor.email}
                    {action.reasonCode && ` · ${action.reasonCode}`}
                  </div>
                  {action.internalNote && (
                    <div className="mt-1 text-xs text-neutral-600">
                      {action.internalNote}
                    </div>
                  )}
                </div>
                <time
                  className="shrink-0 text-xs text-neutral-500"
                  dateTime={action.createdAt.toISOString()}
                >
                  {action.createdAt.toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="text-sm text-neutral-800">{value}</dd>
    </div>
  );
}
