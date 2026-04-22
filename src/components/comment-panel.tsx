"use client";

import { useEffect, useState } from "react";

interface Author {
  id: string;
  email: string;
}

interface CommentDetail {
  id: string;
  body: string;
  createdAt: string;
  author: Author;
}

interface ThreadSummary {
  id: string;
  targetType: string;
  targetId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  author: Author;
  firstComment: { id: string; body: string; createdAt: string; author: Author } | null;
  replyCount: number;
}

interface ThreadDetail {
  id: string;
  targetType: string;
  targetId: string;
  status: string;
  createdAt: string;
  author: Author;
  comments: CommentDetail[];
}

interface CommentPanelProps {
  projectId: string;
  targetType: "project" | "file" | "version";
  targetId: string;
}

const headers = { "x-user-id": "dev-user", "Content-Type": "application/json" };

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}

export function CommentPanel({ projectId, targetType, targetId }: CommentPanelProps) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedThread, setExpandedThread] = useState<ThreadDetail | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  // New thread form
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  // Reply form
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  const apiBase = `/api/projects/${projectId}/comments`;

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ targetType, targetId });
    fetch(`${apiBase}?${qs}`, { headers })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) setThreads(await res.json());
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [apiBase, targetType, targetId, refreshKey]);

  async function handleExpand(threadId: string) {
    if (expandedId === threadId) {
      setExpandedId(null);
      setExpandedThread(null);
      setReplyBody("");
      return;
    }

    setExpandedId(threadId);
    setLoadingThread(true);
    const res = await fetch(`${apiBase}/${threadId}`, { headers });
    if (res.ok) {
      setExpandedThread(await res.json());
    }
    setLoadingThread(false);
  }

  async function handleCreateThread(e: React.FormEvent) {
    e.preventDefault();
    if (!newBody.trim()) return;
    setCreating(true);
    const res = await fetch(apiBase, {
      method: "POST",
      headers,
      body: JSON.stringify({ targetType, targetId, body: newBody.trim() }),
    });
    if (res.ok) {
      setNewBody("");
      setRefreshKey((k) => k + 1);
    }
    setCreating(false);
  }

  async function handleReply(e: React.FormEvent, threadId: string) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setReplying(true);
    const res = await fetch(`${apiBase}/${threadId}/replies`, {
      method: "POST",
      headers,
      body: JSON.stringify({ body: replyBody.trim() }),
    });
    if (res.ok) {
      setReplyBody("");
      // Refresh expanded thread
      const threadRes = await fetch(`${apiBase}/${threadId}`, { headers });
      if (threadRes.ok) setExpandedThread(await threadRes.json());
      setRefreshKey((k) => k + 1);
    }
    setReplying(false);
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-neutral-900">
          Comments
          {!loading && threads.length > 0 && (
            <span className="ml-2 text-neutral-400 font-normal">
              ({threads.length})
            </span>
          )}
        </h3>
      </div>

      <div className="divide-y divide-neutral-100">
        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-neutral-500">
            Loading comments…
          </p>
        ) : threads.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-neutral-500">
            No comments yet. Start a discussion below.
          </p>
        ) : (
          threads.map((thread) => {
            const isExpanded = expandedId === thread.id;
            return (
              <div key={thread.id}>
                {/* Thread summary row */}
                <button
                  onClick={() => handleExpand(thread.id)}
                  className="w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-xs text-neutral-400">
                      {isExpanded ? "▼" : "▶"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-900">
                          {thread.author.email}
                        </span>
                        <span className="text-xs text-neutral-400">
                          {timeAgo(thread.createdAt)}
                        </span>
                        {thread.status === "resolved" && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            resolved
                          </span>
                        )}
                      </div>
                      {thread.firstComment && (
                        <p className="mt-0.5 text-sm text-neutral-600 truncate">
                          {truncate(thread.firstComment.body, 120)}
                        </p>
                      )}
                      {thread.replyCount > 0 && (
                        <span className="mt-1 inline-block text-xs text-neutral-400">
                          {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded thread detail */}
                {isExpanded && (
                  <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-3">
                    {loadingThread ? (
                      <p className="text-sm text-neutral-500">Loading thread…</p>
                    ) : expandedThread ? (
                      <div className="space-y-3">
                        {expandedThread.comments.map((comment, idx) => (
                          <div
                            key={comment.id}
                            className={`rounded-md p-3 ${
                              idx === 0
                                ? "bg-white border border-neutral-200"
                                : "bg-white border border-neutral-200 ml-4"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-neutral-900">
                                {comment.author.email}
                              </span>
                              <span className="text-xs text-neutral-400">
                                {timeAgo(comment.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-neutral-700 whitespace-pre-wrap">
                              {comment.body}
                            </p>
                          </div>
                        ))}

                        {/* Reply form */}
                        <form
                          onSubmit={(e) => handleReply(e, expandedThread.id)}
                          className="ml-4 flex gap-2"
                        >
                          <input
                            type="text"
                            value={replyBody}
                            onChange={(e) => setReplyBody(e.target.value)}
                            placeholder="Write a reply…"
                            className="flex-1 rounded border border-neutral-200 px-3 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={replying || !replyBody.trim()}
                            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
                          >
                            {replying ? "…" : "Reply"}
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* New thread form */}
      <div className="border-t border-neutral-200 px-4 py-3">
        <form onSubmit={handleCreateThread} className="flex gap-2">
          <input
            type="text"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Start a new thread…"
            className="flex-1 rounded border border-neutral-200 px-3 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating || !newBody.trim()}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {creating ? "…" : "Comment"}
          </button>
        </form>
      </div>
    </div>
  );
}
