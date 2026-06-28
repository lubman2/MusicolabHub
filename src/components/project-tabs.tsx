"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { label: string; href: (id: string) => string; match: RegExp };

const TABS: Tab[] = [
  {
    label: "Přehled",
    href: (id) => `/projects/${id}`,
    match: /^\/projects\/[^/]+$/,
  },
  {
    label: "Soubory",
    href: (id) => `/projects/${id}/files`,
    match: /^\/projects\/[^/]+\/files(\/|$)/,
  },
  {
    label: "Verze",
    href: (id) => `/projects/${id}/versions`,
    match: /^\/projects\/[^/]+\/versions(\/|$)/,
  },
  {
    label: "Aktivita",
    href: (id) => `/projects/${id}/activity`,
    match: /^\/projects\/[^/]+\/activity(\/|$)/,
  },
  {
    label: "Splits",
    href: (id) => `/projects/${id}/splits`,
    match: /^\/projects\/[^/]+\/splits(\/|$)/,
  },
  {
    label: "Gigs",
    href: (id) => `/projects/${id}/gigs`,
    match: /^\/projects\/[^/]+\/gigs(\/|$)/,
  },
  {
    label: "Nastavení",
    href: (id) => `/projects/${id}/settings`,
    match: /^\/projects\/[^/]+\/settings(\/|$)/,
  },
];

export function ProjectTabs({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle?: string;
}) {
  const pathname = usePathname() ?? "";

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/dashboard" className="hover:text-neutral-900 hover:underline">
          ← Projekty
        </Link>
        {projectTitle && (
          <>
            <span aria-hidden="true">/</span>
            <Link
              href={`/projects/${projectId}`}
              className="truncate hover:text-neutral-900 hover:underline"
            >
              {projectTitle}
            </Link>
          </>
        )}
      </div>
      <nav className="mt-3 border-b border-neutral-200">
        <ul className="flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const href = tab.href(projectId);
            const active = tab.match.test(pathname);
            return (
              <li key={tab.label}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-block rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "border-b-2 border-neutral-900 text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
