import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AdminProjectActions } from "./admin-project-actions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<
  "active" | "archived" | "suspended" | "deleted_soft",
  { label: string; tone: string }
> = {
  active: { label: "Active", tone: "bg-emerald-100 text-emerald-800" },
  archived: { label: "Archived", tone: "bg-amber-100 text-amber-800" },
  suspended: { label: "Restricted", tone: "bg-red-100 text-red-800" },
  deleted_soft: { label: "Deleted", tone: "bg-neutral-200 text-neutral-700" },
};

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      owner: { select: { id: true, email: true } },
    },
  });

  if (!project) notFound();

  const recentActions = await prisma.adminAction.findMany({
    where: { targetType: "project", targetId: id },
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

  const statusMeta = STATUS_LABELS[project.status];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/projects"
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            ← Projects
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">
            {project.title}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Owner:{" "}
            <Link
              href={`/admin/users/${project.owner.id}`}
              className="underline-offset-2 hover:underline"
            >
              {project.owner.email}
            </Link>
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.tone}`}
        >
          {statusMeta.label}
        </span>
      </header>

      {project.description && (
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900">
            Description
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
            {project.description}
          </p>
        </section>
      )}

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">
          Moderation actions
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Restricting a project hides it from members until it is restored.
        </p>
        <div className="mt-4">
          <AdminProjectActions projectId={project.id} status={project.status} />
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">
          Recent admin actions
        </h2>
        {recentActions.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            No admin actions recorded for this project.
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
