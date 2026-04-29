"use client";

import { Nav } from "@/components/nav";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface ProjectDetail {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  genre: string | null;
  tags: string[];
  coverImageUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    members: number;
    files: number;
    versions: number;
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ProjectDetailPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showCreatedToast, setShowCreatedToast] = useState(justCreated);

  useEffect(() => {
    if (!showCreatedToast) return;
    const timer = setTimeout(() => setShowCreatedToast(false), 4000);
    return () => clearTimeout(timer);
  }, [showCreatedToast]);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/projects/${projectId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (res.status === 404 || res.status === 403) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError("Nepodařilo se načíst projekt.");
          setLoading(false);
          return;
        }
        const data: ProjectDetail = await res.json();
        setProject(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Chyba při načítání projektu.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        {showCreatedToast && (
          <div
            role="status"
            className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          >
            Projekt byl úspěšně založen.
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          </div>
        ) : notFound ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
            <h1 className="text-xl font-semibold text-neutral-900">
              Projekt nenalezen
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              Tento projekt neexistuje, nebo k němu nemáte přístup.
            </p>
            <Link
              href="/dashboard"
              className="mt-4 inline-block text-sm text-neutral-700 hover:underline"
            >
              ← Zpět na projekty
            </Link>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : project ? (
          <ProjectDetailView project={project} />
        ) : null}
      </main>
    </>
  );
}

function ProjectDetailView({ project }: { project: ProjectDetail }) {
  const tabs: { label: string; href: string }[] = [
    { label: "Soubory", href: `/projects/${project.id}/files` },
    { label: "Verze", href: `/projects/${project.id}/versions` },
    { label: "Aktivita", href: `/projects/${project.id}/activity` },
    { label: "Splits", href: `/projects/${project.id}/splits` },
    { label: "Gigs", href: `/projects/${project.id}/gigs` },
    { label: "Nastavení", href: `/projects/${project.id}/settings` },
  ];

  return (
    <>
      {/* Cover */}
      {project.coverImageUrl ? (
        <div className="relative mb-6 h-48 w-full overflow-hidden rounded-lg bg-neutral-100">
          <Image
            src={project.coverImageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 1280px) 100vw, 1280px"
          />
        </div>
      ) : (
        <div className="mb-6 flex h-48 w-full items-center justify-center rounded-lg bg-neutral-50">
          <svg
            className="h-12 w-12 text-neutral-300"
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

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-neutral-900">
            {project.title}
          </h1>
          {project.genre && (
            <p className="mt-1 text-sm text-neutral-500">{project.genre}</p>
          )}
        </div>
        {project.status !== "active" && (
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
            {project.status}
          </span>
        )}
      </div>

      {/* Description */}
      {project.description && (
        <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700">
          {project.description}
        </p>
      )}

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-neutral-500">Členové:</dt>
          <dd className="font-medium text-neutral-900">
            {project._count.members}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-neutral-500">Soubory:</dt>
          <dd className="font-medium text-neutral-900">
            {project._count.files}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-neutral-500">Verze:</dt>
          <dd className="font-medium text-neutral-900">
            {project._count.versions}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-neutral-500">Vytvořeno:</dt>
          <dd className="text-neutral-700">{formatDate(project.createdAt)}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-neutral-500">Aktualizováno:</dt>
          <dd className="text-neutral-700">{formatDate(project.updatedAt)}</dd>
        </div>
      </dl>

      {/* Tabs */}
      <nav className="mt-8 border-b border-neutral-200">
        <ul className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className="inline-block rounded-t-md px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
