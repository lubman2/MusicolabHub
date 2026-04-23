"use client";

import { Nav } from "@/components/nav";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";

type Filter = "all" | "owned" | "member";

interface ProjectCard {
  id: string;
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
  _count: { members: number; files: number; versions: number };
}

interface PaginatedResponse {
  data: ProjectCard[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

async function fetchProjectsApi(
  filter: Filter,
  page: number,
): Promise<PaginatedResponse> {
  const res = await fetch(
    `/api/projects?filter=${filter}&page=${page}&limit=12&sort=updatedAt&order=desc`,
  );
  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = "/login";
      throw new Error("Redirecting to login");
    }
    throw new Error("Failed to load projects");
  }
  return res.json();
}

interface SubscriptionInfo {
  status: string | null;
  plan: string | null;
  canRead: boolean;
  canWrite: boolean;
  graceRemaining: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

export default function DashboardPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null,
  );
  const currentPage = useRef(1);

  // Fetch subscription status on mount
  useEffect(() => {
    fetch("/api/subscription/status")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data?.subscription) {
          setSubscription(data.subscription);
        }
      })
      .catch(() => {
        // Silently fail - subscription banner optional
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    currentPage.current = 1;

    fetchProjectsApi(filter, 1).then(
      (json) => {
        if (cancelled) return;
        setProjects(json.data);
        setPagination(json.pagination);
        setLoading(false);
        setError(null);
      },
      (e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [filter]);

  const goToPage = useCallback(
    (page: number) => {
      currentPage.current = page;
      setLoading(true);
      fetchProjectsApi(filter, page).then(
        (json) => {
          if (currentPage.current !== page) return;
          setProjects(json.data);
          setPagination(json.pagination);
          setLoading(false);
          setError(null);
        },
        (e) => {
          if (currentPage.current !== page) return;
          setError(e instanceof Error ? e.message : "Unknown error");
          setLoading(false);
        },
      );
    },
    [filter],
  );

  const filterLabels: Record<Filter, string> = {
    all: "All projects",
    owned: "My projects",
    member: "Shared with me",
  };

  return (
    <>
      <Nav />

      {/* Subscription status banner */}
      {subscription && <SubscriptionBanner subscription={subscription} />}

      <main className="mx-auto w-full max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {pagination.total} project{pagination.total !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/projects/new"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            New project
          </Link>
        </div>

        {/* Filters */}
        <div className="mt-6 flex gap-1 rounded-lg bg-neutral-100 p-1">
          {(Object.keys(filterLabels) as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="mt-12 flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          </div>
        ) : error ? (
          <div className="mt-12 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <>
            {/* Project grid */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCardItem key={project.id} project={project} />
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => goToPage(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-neutral-600">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => goToPage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function ProjectCardItem({ project }: { project: ProjectCard }) {
  const ownerName =
    project.owner.profile?.displayName ?? project.owner.email;
  const timeAgo = formatRelativeTime(project.updatedAt);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group rounded-lg border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md"
    >
      {/* Cover image placeholder */}
      {project.coverImageUrl ? (
        <div className="relative mb-3 h-32 overflow-hidden rounded-md bg-neutral-100">
          <Image
            src={project.coverImageUrl}
            alt=""
            fill
            className="object-cover"
          />
        </div>
      ) : (
        <div className="mb-3 flex h-32 items-center justify-center rounded-md bg-neutral-50">
          <svg
            className="h-8 w-8 text-neutral-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z"
            />
          </svg>
        </div>
      )}

      <h3 className="font-semibold text-neutral-900 group-hover:text-neutral-700">
        {project.title}
      </h3>

      {project.description && (
        <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
          {project.description}
        </p>
      )}

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {project.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
            >
              {tag}
            </span>
          ))}
          {project.tags.length > 3 && (
            <span className="text-xs text-neutral-400">
              +{project.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Meta */}
      <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
        <span>{ownerName}</span>
        <span>{timeAgo}</span>
      </div>

      {/* Stats */}
      <div className="mt-2 flex gap-3 text-xs text-neutral-400">
        <span>{project._count.members} member{project._count.members !== 1 ? "s" : ""}</span>
        <span>{project._count.files} file{project._count.files !== 1 ? "s" : ""}</span>
        <span>{project._count.versions} version{project._count.versions !== 1 ? "s" : ""}</span>
      </div>
    </Link>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  const messages: Record<Filter, { title: string; desc: string }> = {
    all: {
      title: "No projects yet",
      desc: "Create your first project to start collaborating on music.",
    },
    owned: {
      title: "No projects created",
      desc: "You haven't created any projects yet.",
    },
    member: {
      title: "No shared projects",
      desc: "You haven't been invited to any projects yet.",
    },
  };

  const { title, desc } = messages[filter];

  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
        <svg
          className="h-8 w-8 text-neutral-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z"
          />
        </svg>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-neutral-900">{title}</h2>
      <p className="mt-1 text-sm text-neutral-500">{desc}</p>
      <Link
        href="/projects/new"
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Create project
      </Link>
    </div>
  );
}

function SubscriptionBanner({
  subscription,
}: {
  subscription: SubscriptionInfo;
}) {
  const { status, trialEndsAt, graceRemaining } = subscription;

  // Don't show banner for active paid subscriptions
  if (status === "active" || status === "admin") {
    return null;
  }

  // Trial banner
  if (status === "trialing" && trialEndsAt) {
    const daysLeft = Math.ceil(
      (new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    return (
      <div className="border-b border-blue-200 bg-blue-50 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <p className="text-sm text-blue-900">
            You're on a free trial with{" "}
            <strong>{daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining</strong>.
          </p>
          <Link
            href="/pricing"
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Upgrade now
          </Link>
        </div>
      </div>
    );
  }

  // Past due banner
  if (status === "past_due") {
    return (
      <div className="border-b border-orange-200 bg-orange-50 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <p className="text-sm font-medium text-orange-900">
              Payment past due
            </p>
            <p className="text-xs text-orange-700">
              {graceRemaining && graceRemaining > 0
                ? `Update payment method within ${graceRemaining} day${graceRemaining !== 1 ? "s" : ""} to avoid losing access.`
                : "Write access suspended. Update payment to continue creating."}
            </p>
          </div>
          <Link
            href="/pricing"
            className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            Update payment
          </Link>
        </div>
      </div>
    );
  }

  // Inactive subscription (canceled/expired)
  if (status === "canceled" || status === "expired" || !status) {
    return (
      <div className="border-b border-red-200 bg-red-50 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <p className="text-sm text-red-900">
            Your subscription is inactive. Subscribe to continue using
            MusicolabHub.
          </p>
          <Link
            href="/pricing"
            className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Subscribe
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}
