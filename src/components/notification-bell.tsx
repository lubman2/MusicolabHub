"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type NotificationType =
  | "comment_added"
  | "invitation_received"
  | "version_published"
  | "member_joined"
  | "split_submitted"
  | "split_confirmed"
  | "split_rejected";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  isRead: boolean;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  data: Notification[];
  unreadCount: number;
}

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20", {
        cache: "no-store",
      });
      if (res.status === 401) {
        setSignedIn(false);
        return;
      }
      if (!res.ok) return;
      const json: NotificationsResponse = await res.json();
      setSignedIn(true);
      setItems(json.data);
      setUnreadCount(json.unreadCount);
      setLoaded(true);
    } catch {
      // silent — bell is non-critical
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      void refresh();
    };
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markRead = async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
    } catch {
      // ignore — next refresh will reconcile
    }
  };

  if (!signedIn) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
        className="relative rounded-md p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg">
          <div className="border-b border-neutral-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Notifications
          </div>
          <ul className="max-h-96 divide-y divide-neutral-100 overflow-y-auto">
            {!loaded && items.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-neutral-500">
                Loading…
              </li>
            )}
            {loaded && items.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-neutral-500">
                You&rsquo;re all caught up.
              </li>
            )}
            {items.map((n) => (
              <li
                key={n.id}
                className={`px-3 py-2.5 ${
                  n.isRead ? "bg-white" : "bg-blue-50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => !n.isRead && markRead(n.id)}
                  className="block w-full text-left"
                >
                  <p className="text-sm font-medium text-neutral-900">
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutral-600">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-neutral-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
