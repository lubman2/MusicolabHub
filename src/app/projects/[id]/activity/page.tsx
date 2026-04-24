"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Actor {
  id: string;
  email: string;
  profile: { displayName: string | null } | null;
}

type ActivityAction =
  | "file_uploaded"
  | "version_published"
  | "version_deleted"
  | "member_joined"
  | "comment_added"
  | "split_submitted"
  | "split_confirmed"
  | "split_rejected"
  | "member_invited"
  | "member_removed"
  | "project_created"
  | "project_archived";

type TargetType = "project" | "file" | "version" | "split" | "member";

interface ActivityEntry {
  id: string;
  action: ActivityAction;
  targetType: TargetType;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: Actor;
}

interface ActivityResponse {
  data: ActivityEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface GroupedEntry {
  key: string;
  action: ActivityAction;
  targetType: TargetType;
  actor: Actor;
  entries: ActivityEntry[];
  latestAt: string;
}

function actorName(actor: Actor): string {
  return actor.profile?.displayName || actor.email;
}

function actorInitials(actor: Actor): string {
  const name = actorName(actor);
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "před chvílí";
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `před ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `před ${days} d`;
  return formatDateTime(iso);
}

const ACTION_VERBS: Record<ActivityAction, { single: string; plural: (n: number) => string }> = {
  file_uploaded: {
    single: "nahrál(a) soubor",
    plural: (n) => `nahrál(a) ${n} souborů`,
  },
  version_published: {
    single: "publikoval(a) verzi",
    plural: (n) => `publikoval(a) ${n} verzí`,
  },
  version_deleted: {
    single: "smazal(a) verzi",
    plural: (n) => `smazal(a) ${n} verzí`,
  },
  member_joined: {
    single: "se připojil(a) k projektu",
    plural: (n) => `se připojil(a) k projektu (${n}×)`,
  },
  comment_added: {
    single: "přidal(a) komentář",
    plural: (n) => `přidal(a) ${n} komentářů`,
  },
  split_submitted: {
    single: "navrhl(a) rozdělení podílů",
    plural: (n) => `navrhl(a) ${n} rozdělení podílů`,
  },
  split_confirmed: {
    single: "potvrdil(a) rozdělení podílů",
    plural: (n) => `potvrdil(a) ${n} rozdělení podílů`,
  },
  split_rejected: {
    single: "odmítl(a) rozdělení podílů",
    plural: (n) => `odmítl(a) ${n} rozdělení podílů`,
  },
  member_invited: {
    single: "pozval(a) člena",
    plural: (n) => `pozval(a) ${n} členů`,
  },
  member_removed: {
    single: "odebral(a) člena",
    plural: (n) => `odebral(a) ${n} členů`,
  },
  project_created: {
    single: "vytvořil(a) projekt",
    plural: (n) => `vytvořil(a) projekt (${n}×)`,
  },
  project_archived: {
    single: "archivoval(a) projekt",
    plural: (n) => `archivoval(a) projekt (${n}×)`,
  },
};

function targetHref(
  projectId: string,
  entry: ActivityEntry,
): string | null {
  switch (entry.targetType) {
    case "project":
      return `/projects/${projectId}`;
    case "file":
      return `/projects/${projectId}/files`;
    case "version":
      return `/projects/${projectId}/versions/${entry.targetId}`;
    case "split":
      return `/projects/${projectId}/splits/${entry.targetId}`;
    case "member":
      return `/projects/${projectId}/settings/members`;
    default:
      return null;
  }
}

function targetLabel(entry: ActivityEntry): string {
  const meta = entry.metadata ?? {};
  if (typeof meta.name === "string" && meta.name.trim().length > 0) return meta.name;
  if (typeof meta.filename === "string" && meta.filename.trim().length > 0) return meta.filename;
  if (typeof meta.title === "string" && meta.title.trim().length > 0) return meta.title;
  switch (entry.targetType) {
    case "file":
      return "soubor";
    case "version":
      return "verze";
    case "split":
      return "split sheet";
    case "member":
      return "člena";
    case "project":
      return "projekt";
    default:
      return entry.targetType;
  }
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function groupEntries(entries: ActivityEntry[]): GroupedEntry[] {
  const groups: GroupedEntry[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    const sameKind =
      last &&
      last.action === entry.action &&
      last.actor.id === entry.actor.id &&
      last.targetType === entry.targetType;
    const withinWindow =
      last &&
      new Date(last.latestAt).getTime() - new Date(entry.createdAt).getTime() <
        GROUP_WINDOW_MS;
    if (sameKind && withinWindow) {
      last.entries.push(entry);
    } else {
      groups.push({
        key: entry.id,
        action: entry.action,
        targetType: entry.targetType,
        actor: entry.actor,
        entries: [entry],
        latestAt: entry.createdAt,
      });
    }
  }
  return groups;
}

export default function ActivityPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [resp, setResp] = useState<ActivityResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({ page: String(page), limit: "20" });

    fetch(`/api/projects/${projectId}/activity?${qs}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          setResp(await res.json());
          setError(null);
        } else if (res.status === 401) {
          setError("Pro zobrazení aktivity se musíte přihlásit.");
        } else if (res.status === 403) {
          setError("Nemáte oprávnění k zobrazení aktivity tohoto projektu.");
        } else {
          setError("Nepodařilo se načíst aktivitu projektu.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Chyba při načítání aktivity.");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, page]);

  function goToPage(p: number) {
    const qs = new URLSearchParams();
    if (p > 1) qs.set("page", String(p));
    const q = qs.toString();
    router.push(`/projects/${projectId}/activity${q ? `?${q}` : ""}`);
  }

  const entries = resp?.data ?? [];
  const groups = groupEntries(entries);
  const pagination = resp?.pagination;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Aktivita projektu</h1>
        </div>

        {!loaded && !resp && !error && (
          <p className="mt-8 text-sm text-neutral-500">Načítání…</p>
        )}

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {loaded && !error && groups.length === 0 && (
          <div className="mt-12 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-6 py-16 text-center">
            <p className="text-base font-medium text-neutral-800">
              Zatím žádná aktivita
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              Jakmile někdo nahraje soubor, publikuje verzi nebo přidá komentář,
              objeví se zde záznam.
            </p>
          </div>
        )}

        {!error && groups.length > 0 && (
          <>
            <ul className="mt-6 space-y-3">
              {groups.map((group) => {
                const verb =
                  group.entries.length > 1
                    ? ACTION_VERBS[group.action].plural(group.entries.length)
                    : ACTION_VERBS[group.action].single;
                const showTargets = group.entries.length > 1;
                const firstHref = targetHref(projectId, group.entries[0]);
                const firstLabel = targetLabel(group.entries[0]);

                return (
                  <li
                    key={group.key}
                    className="flex gap-3 rounded-lg border border-neutral-200 bg-white p-4"
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700"
                      aria-hidden
                    >
                      {actorInitials(group.actor)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                        <span className="font-medium text-neutral-900">
                          {actorName(group.actor)}
                        </span>
                        <span className="text-neutral-600">{verb}</span>
                        {!showTargets && firstHref && (
                          <Link
                            href={firstHref}
                            className="truncate font-medium text-blue-600 hover:text-blue-800"
                          >
                            {firstLabel}
                          </Link>
                        )}
                        {!showTargets && !firstHref && (
                          <span className="truncate font-medium text-neutral-700">
                            {firstLabel}
                          </span>
                        )}
                      </div>
                      <div
                        className="mt-1 text-xs text-neutral-500"
                        title={formatDateTime(group.latestAt)}
                      >
                        {formatRelative(group.latestAt)}
                      </div>
                      {showTargets && (
                        <ul className="mt-2 space-y-1 text-sm">
                          {group.entries.map((e) => {
                            const href = targetHref(projectId, e);
                            const label = targetLabel(e);
                            return (
                              <li key={e.id} className="truncate">
                                {href ? (
                                  <Link
                                    href={href}
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    {label}
                                  </Link>
                                ) : (
                                  <span className="text-neutral-700">{label}</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {pagination && pagination.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-40"
                >
                  Předchozí
                </button>
                <span className="text-sm text-neutral-600">
                  {page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= pagination.totalPages}
                  className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-40"
                >
                  Další
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
