import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SuspendUserDialog } from "@/components/admin/suspend-user-dialog";
import { CONNECT_PUBLIC_SELECT } from "@/lib/connect";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  unverified: "bg-amber-100 text-amber-800",
  verified: "bg-blue-100 text-blue-800",
  onboarded: "bg-emerald-100 text-emerald-800",
  suspended: "bg-red-100 text-red-800",
};

const CONNECT_STATUS_BADGE: Record<string, string> = {
  not_started: "bg-neutral-100 text-neutral-700",
  onboarding: "bg-amber-100 text-amber-800",
  pending_verification: "bg-blue-100 text-blue-800",
  verified: "bg-emerald-100 text-emerald-800",
  restricted: "bg-orange-100 text-orange-800",
  disabled: "bg-red-100 text-red-800",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      status: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      profile: {
        select: { displayName: true, headline: true },
      },
    },
  });

  if (!user) notFound();

  const connectAccount = await prisma.connectAccount.findUnique({
    where: { userId: user.id },
    select: CONNECT_PUBLIC_SELECT,
  });

  const recentActions = await prisma.adminAction.findMany({
    where: { targetType: "user", targetId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      actionType: true,
      reasonCode: true,
      internalNote: true,
      createdAt: true,
      actor: { select: { id: true, email: true } },
    },
  });

  const isAdmin = user.role === "admin";
  const isSuspended = user.status === "suspended";

  return (
    <div>
      <Link
        href="/admin/users"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Users
      </Link>

      <header className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            {user.profile?.displayName ?? user.email}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">{user.email}</p>
          {user.profile?.headline && (
            <p className="mt-1 text-sm text-neutral-500">
              {user.profile.headline}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_BADGE[user.status] ?? "bg-neutral-100 text-neutral-700"}`}
            >
              {user.status}
            </span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-700">
              role: {user.role}
            </span>
          </div>
        </div>

        <div className="shrink-0">
          {isAdmin ? (
            <p className="text-xs text-neutral-500">
              Admin accounts cannot be suspended here.
            </p>
          ) : isSuspended ? (
            <SuspendUserDialog userId={user.id} mode="unsuspend" />
          ) : (
            <SuspendUserDialog userId={user.id} mode="suspend" />
          )}
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          Account metadata
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-neutral-500">User ID</dt>
            <dd className="mt-1 font-mono text-neutral-900">{user.id}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-neutral-500">Created</dt>
            <dd className="mt-1 text-neutral-900">
              {user.createdAt.toISOString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-neutral-500">Updated</dt>
            <dd className="mt-1 text-neutral-900">
              {user.updatedAt.toISOString()}
            </dd>
          </div>
        </dl>
      </section>

      {connectAccount && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
            Stripe Connect & KYC
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Read-only view of Stripe-owned KYC state. Admin cannot override
            verdicts here — to act on a stuck user, hold their payouts
            (admin_hold) while they resolve the issue with Stripe.
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-neutral-500">Status</dt>
              <dd className="mt-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CONNECT_STATUS_BADGE[connectAccount.status] ?? "bg-neutral-100 text-neutral-700"}`}
                >
                  {connectAccount.status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-neutral-500">
                Stripe account ID
              </dt>
              <dd className="mt-1 font-mono text-xs text-neutral-900">
                {connectAccount.stripeAccountId ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-neutral-500">
                Payouts enabled
              </dt>
              <dd className="mt-1 text-neutral-900">
                {connectAccount.payoutsEnabled ? "yes" : "no"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-neutral-500">
                Charges enabled
              </dt>
              <dd className="mt-1 text-neutral-900">
                {connectAccount.chargesEnabled ? "yes" : "no"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-neutral-500">
                Details submitted
              </dt>
              <dd className="mt-1 text-neutral-900">
                {connectAccount.detailsSubmitted ? "yes" : "no"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-neutral-500">Country</dt>
              <dd className="mt-1 text-neutral-900">
                {connectAccount.country ?? "—"}
                {connectAccount.defaultCurrency
                  ? ` · ${connectAccount.defaultCurrency.toUpperCase()}`
                  : ""}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase text-neutral-500">
                Disabled reason
              </dt>
              <dd className="mt-1 text-neutral-900">
                {connectAccount.disabledReason ? (
                  <span className="font-mono text-xs">
                    {connectAccount.disabledReason}
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase text-neutral-500">
                Requirements due
              </dt>
              <dd className="mt-1 text-neutral-900">
                {connectAccount.requirementsDue.length === 0 ? (
                  "None"
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {connectAccount.requirementsDue.map((req) => (
                      <li
                        key={req}
                        className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-xs text-amber-800"
                      >
                        {req}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-neutral-500">
                Last synced
              </dt>
              <dd className="mt-1 text-neutral-900">
                {connectAccount.lastSyncedAt
                  ? connectAccount.lastSyncedAt.toISOString()
                  : "never"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-neutral-500">Created</dt>
              <dd className="mt-1 text-neutral-900">
                {connectAccount.createdAt.toISOString()}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          Admin action history
        </h2>
        {recentActions.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
            No moderation actions recorded for this user.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {recentActions.map((action) => (
              <li key={action.id} className="px-4 py-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-neutral-900">
                    {action.actionType}
                  </span>
                  <time className="text-xs text-neutral-500">
                    {action.createdAt.toISOString()}
                  </time>
                </div>
                <p className="mt-1 text-xs text-neutral-600">
                  by {action.actor.email}
                  {action.reasonCode && (
                    <>
                      {" · "}
                      <span className="font-mono">{action.reasonCode}</span>
                    </>
                  )}
                </p>
                {action.internalNote && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
                    {action.internalNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
