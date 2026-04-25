import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SuspendUserDialog } from "@/components/admin/suspend-user-dialog";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  unverified: "bg-amber-100 text-amber-800",
  verified: "bg-blue-100 text-blue-800",
  onboarded: "bg-emerald-100 text-emerald-800",
  suspended: "bg-red-100 text-red-800",
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
