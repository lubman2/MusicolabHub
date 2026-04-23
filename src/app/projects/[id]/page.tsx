"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface ProjectDetailResponse {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  genre: string | null;
  tags: string[];
  coverImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    email: string;
    profile: { displayName: string | null } | null;
  };
  members: Array<{
    id: string;
    role: string;
    joinedAt: string;
    user: {
      id: string;
      email: string;
      profile: { displayName: string | null } | null;
    };
  }>;
  _count: {
    members: number;
    files: number;
    versions: number;
    splitRecords: number;
    commentThreads: number;
  };
}

const NAV_ITEMS = [
  { label: "Overview", kind: "current" as const },
  { label: "Files", kind: "upcoming" as const },
  { label: "Versions", kind: "link" as const, href: "versions" },
  { label: "Comments", kind: "upcoming" as const },
  { label: "Splits", kind: "link" as const, href: "splits" },
  { label: "Settings", kind: "link" as const, href: "settings/members" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function personLabel(person: {
  email: string;
  profile: { displayName: string | null } | null;
}) {
  return person.profile?.displayName || person.email;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/projects/${id}`).then(async (res) => {
      if (cancelled) return;

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Failed to load project");
        setLoading(false);
        return;
      }

      setProject(await res.json());
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : error || !project ? (
          <p className="text-sm text-red-600">{error || "Project not found."}</p>
        ) : (
          <>
            <header className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              <div className="h-32 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-700" />
              <div className="px-6 py-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h1 className="text-3xl font-bold text-neutral-900">
                      {project.title}
                    </h1>
                    <p className="mt-2 text-sm text-neutral-500">
                      Owner: {personLabel(project.owner)}
                    </p>
                    {project.description && (
                      <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                        {project.description}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {project.genre && (
                        <span className="rounded-full bg-neutral-900 px-3 py-1 text-sm text-white">
                          {project.genre}
                        </span>
                      )}
                      {project.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                    <Metric label="Members" value={project._count.members} />
                    <Metric label="Files" value={project._count.files} />
                    <Metric label="Versions" value={project._count.versions} />
                    <Metric label="Comments" value={project._count.commentThreads} />
                    <Metric label="Splits" value={project._count.splitRecords} />
                    <Metric label="Updated" value={formatDate(project.updatedAt)} />
                  </dl>
                </div>
              </div>
            </header>

            <nav className="mt-6 flex flex-wrap gap-2">
              {NAV_ITEMS.map((item) => {
                if (item.kind === "current") {
                  return (
                    <span
                      key={item.label}
                      className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
                    >
                      {item.label}
                    </span>
                  );
                }

                if (item.kind === "upcoming") {
                  return (
                    <span
                      key={item.label}
                      className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-400"
                    >
                      {item.label}
                    </span>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={`/projects/${project.id}/${item.href}`}
                    className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <section className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
              <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-neutral-900">Project hub</h2>
                <p className="mt-3 text-sm leading-6 text-neutral-700">
                  This page acts as the member-only landing point for the project. The
                  implementation now provides the missing authenticated detail route and
                  a single place to branch into versions, splits, and member settings.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <QuickLink
                    href={`/projects/${project.id}/versions`}
                    title="Version history"
                    body="Review published versions, changelogs, and file snapshots."
                  />
                  <QuickLink
                    href={`/projects/${project.id}/splits`}
                    title="Revenue splits"
                    body="Manage ownership records and contributor allocations."
                  />
                  <QuickLink
                    href={`/projects/${project.id}/settings/members`}
                    title="Members & invitations"
                    body="Invite collaborators and review access-related activity."
                  />
                </div>
              </div>

              <aside className="space-y-6">
                <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                  <h2 className="text-lg font-semibold text-neutral-900">Members</h2>
                  <div className="mt-4 space-y-3">
                    {project.members.length === 0 ? (
                      <p className="text-sm text-neutral-500">
                        No explicit members yet.
                      </p>
                    ) : (
                      project.members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-neutral-900">
                              {personLabel(member.user)}
                            </div>
                            <div className="truncate text-xs text-neutral-500">
                              {member.user.email}
                            </div>
                          </div>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs capitalize text-neutral-600">
                            {member.role}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                  <h2 className="text-lg font-semibold text-neutral-900">Timeline</h2>
                  <dl className="mt-4 space-y-3 text-sm text-neutral-600">
                    <div>
                      <dt className="font-medium text-neutral-900">Created</dt>
                      <dd>{formatDate(project.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-neutral-900">Last updated</dt>
                      <dd>{formatDate(project.updatedAt)}</dd>
                    </div>
                  </dl>
                </div>
              </aside>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}

function QuickLink({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-neutral-200 p-4 transition-colors hover:bg-neutral-50"
    >
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-neutral-600">{body}</p>
    </Link>
  );
}
