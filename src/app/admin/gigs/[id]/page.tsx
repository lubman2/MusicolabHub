import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AdminGigActions } from "./admin-gig-actions";

export const dynamic = "force-dynamic";

type GigStatus =
  | "draft"
  | "published"
  | "hired"
  | "closed"
  | "cancelled"
  | "suspended";

const STATUS_LABELS: Record<GigStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-neutral-100 text-neutral-700" },
  published: { label: "Published", tone: "bg-emerald-100 text-emerald-800" },
  hired: { label: "Hired", tone: "bg-sky-100 text-sky-800" },
  closed: { label: "Closed", tone: "bg-neutral-200 text-neutral-700" },
  cancelled: { label: "Cancelled", tone: "bg-neutral-200 text-neutral-600" },
  suspended: { label: "Suspended", tone: "bg-red-100 text-red-800" },
};

function formatBudget(
  min: number | null,
  max: number | null,
  currency: string,
) {
  if (min === null && max === null) return "—";
  if (min !== null && max !== null) return `${currency} ${min}–${max}`;
  if (min !== null) return `${currency} ${min}+`;
  return `${currency} up to ${max}`;
}

export default async function AdminGigDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const gig = await prisma.gig.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      skills: true,
      genres: true,
      budgetMin: true,
      budgetMax: true,
      budgetCurrency: true,
      deadline: true,
      publishedAt: true,
      suspendedAt: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { id: true, title: true } },
      creator: { select: { id: true, email: true } },
      _count: { select: { applications: true } },
    },
  });

  if (!gig) notFound();

  const recentActions = await prisma.adminAction.findMany({
    where: { targetType: "gig", targetId: id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      actionType: true,
      reasonCode: true,
      internalNote: true,
      createdAt: true,
      actor: { select: { email: true } },
    },
  });

  const statusMeta = STATUS_LABELS[gig.status];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/gigs"
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            ← Gigs
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">
            {gig.title}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Project:{" "}
            <Link
              href={`/admin/projects/${gig.project.id}`}
              className="underline-offset-2 hover:underline"
            >
              {gig.project.title}
            </Link>
            {" · "}
            Creator:{" "}
            <Link
              href={`/admin/users/${gig.creator.id}`}
              className="underline-offset-2 hover:underline"
            >
              {gig.creator.email}
            </Link>
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.tone}`}
        >
          {statusMeta.label}
        </span>
      </header>

      <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-5 sm:grid-cols-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Budget
          </div>
          <div className="mt-1 text-sm text-neutral-900">
            {formatBudget(gig.budgetMin, gig.budgetMax, gig.budgetCurrency)}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Applications
          </div>
          <div className="mt-1 text-sm text-neutral-900">
            {gig._count.applications}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Deadline
          </div>
          <div className="mt-1 text-sm text-neutral-900">
            {gig.deadline ? gig.deadline.toLocaleDateString() : "—"}
          </div>
        </div>
      </section>

      {gig.description && (
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900">
            Description
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
            {gig.description}
          </p>
        </section>
      )}

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">
          Moderation actions
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Suspend hides the gig from the marketplace and freezes its
          applications. Unpublish returns a published gig to the creator&apos;s
          drafts. Restore reverses a suspend.
        </p>
        <div className="mt-4">
          <AdminGigActions gigId={gig.id} status={gig.status} />
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">
          Recent admin actions
        </h2>
        {recentActions.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            No admin actions recorded for this gig.
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
