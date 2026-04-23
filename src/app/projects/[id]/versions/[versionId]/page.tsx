"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface VersionAuthor {
  id: string;
  email: string;
  profile: { displayName: string | null } | null;
}

interface VersionFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  status: string;
  createdAt: string;
  downloadUrl: string | null;
}

interface VersionDetail {
  id: string;
  name: string;
  changelog: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  author: VersionAuthor;
  files: VersionFile[];
}

interface CommentAuthor {
  id: string;
  email: string;
  profile: { displayName: string | null } | null;
}

interface CommentItem {
  id: string;
  body: string;
  createdAt: string;
  author: CommentAuthor;
}

interface CommentThreadSummary {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
  firstComment: CommentItem | null;
  replyCount: number;
}

interface CommentThreadDetail {
  id: string;
  status: string;
  comments: CommentItem[];
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-100 text-green-800",
  draft: "bg-amber-100 text-amber-800",
  superseded: "bg-neutral-100 text-neutral-600",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function authorName(author: VersionAuthor): string {
  return author.profile?.displayName || author.email;
}

export default function VersionDetailPage() {
  const { id: projectId, versionId } = useParams<{
    id: string;
    versionId: string;
  }>();
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [threads, setThreads] = useState<CommentThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const [expandedThread, setExpandedThread] = useState<CommentThreadDetail | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/projects/${projectId}/versions/${versionId}`, {
      headers: { "x-user-id": "dev-user" },
    }).then(async (res) => {
      if (cancelled) return;

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Failed to load version");
        setLoading(false);
        return;
      }

      setVersion(await res.json());
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, versionId]);

  useEffect(() => {
    let cancelled = false;

    fetch(
      `/api/projects/${projectId}/comments?targetType=version&targetId=${versionId}`,
    ).then(async (res) => {
      if (cancelled) return;

      if (!res.ok) {
        setCommentsLoading(false);
        return;
      }

      setThreads(await res.json());
      setCommentsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, versionId]);

  async function reloadThreads() {
    const res = await fetch(
      `/api/projects/${projectId}/comments?targetType=version&targetId=${versionId}`,
    );
    if (res.ok) {
      setThreads(await res.json());
    }
  }

  async function handleCreateThread(e: React.FormEvent) {
    e.preventDefault();
    if (!commentDraft.trim()) return;

    setSubmittingComment(true);

    const res = await fetch(`/api/projects/${projectId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "version",
        targetId: versionId,
        body: commentDraft.trim(),
      }),
    });

    if (res.ok) {
      setCommentDraft("");
      await reloadThreads();
    }

    setSubmittingComment(false);
  }

  async function handleOpenThread(threadId: string) {
    if (expandedThreadId === threadId) {
      setExpandedThreadId(null);
      setExpandedThread(null);
      setReplyDraft("");
      return;
    }

    setExpandedThreadId(threadId);
    const res = await fetch(`/api/projects/${projectId}/comments/${threadId}`);
    if (res.ok) {
      setExpandedThread(await res.json());
      setReplyDraft("");
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!expandedThreadId || !replyDraft.trim()) return;

    setSubmittingReply(true);

    const res = await fetch(
      `/api/projects/${projectId}/comments/${expandedThreadId}/replies`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyDraft.trim() }),
      },
    );

    if (res.ok) {
      setReplyDraft("");
      await handleOpenThread(expandedThreadId);
      await reloadThreads();
    }

    setSubmittingReply(false);
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href={`/projects/${projectId}/versions`}
          className="text-sm text-neutral-500 hover:text-neutral-700"
        >
          &larr; All versions
        </Link>

        {loading ? (
          <p className="mt-8 text-sm text-neutral-500">Loading...</p>
        ) : error ? (
          <p className="mt-8 text-sm text-red-600">{error}</p>
        ) : !version ? (
          <p className="mt-8 text-sm text-red-600">Version not found.</p>
        ) : (
          <>
            <header className="mt-4 flex flex-col gap-4 border-b border-neutral-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-bold text-neutral-900">
                    {version.name}
                  </h1>
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[version.status] ??
                      "bg-neutral-100 text-neutral-700"
                    }`}
                  >
                    {version.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-neutral-500">
                  by {authorName(version.author)}
                </p>
              </div>

              <dl className="grid grid-cols-1 gap-3 text-sm text-neutral-600 sm:text-right">
                <div>
                  <dt className="font-medium text-neutral-900">Created</dt>
                  <dd>{formatDateTime(version.createdAt)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-900">Published</dt>
                  <dd>
                    {version.publishedAt
                      ? formatDateTime(version.publishedAt)
                      : "Not published"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-neutral-900">Files</dt>
                  <dd>{version.files.length}</dd>
                </div>
              </dl>
            </header>

            <section className="mt-8">
              <h2 className="text-lg font-semibold text-neutral-900">Changelog</h2>
              <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-4">
                {version.changelog ? (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                    {version.changelog}
                  </p>
                ) : (
                  <p className="text-sm text-neutral-500">
                    No changelog provided for this version.
                  </p>
                )}
              </div>
            </section>

            <section className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-900">Files</h2>
                <span className="text-sm text-neutral-500">
                  Immutable snapshot
                </span>
              </div>

              {version.files.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
                  This version has no attached files.
                </p>
              ) : (
                <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200">
                  <table className="min-w-full divide-y divide-neutral-200 text-sm">
                    <thead className="bg-neutral-50 text-left text-neutral-600">
                      <tr>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Size</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 bg-white">
                      {version.files.map((file) => (
                        <tr key={file.id}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-neutral-900">
                              {file.originalName}
                            </div>
                            <div className="text-xs text-neutral-500">
                              stored as {file.filename}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-neutral-600">
                            {file.mimeType}
                          </td>
                          <td className="px-4 py-3 text-neutral-600">
                            {formatBytes(file.fileSize)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                              {file.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {file.downloadUrl ? (
                              <a
                                href={file.downloadUrl}
                                className="text-sm font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
                              >
                                Download
                              </a>
                            ) : (
                              <span className="text-sm text-neutral-400">
                                Unavailable
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-900">Comments</h2>
                <span className="text-sm text-neutral-500">
                  Version discussion
                </span>
              </div>

              <form
                onSubmit={handleCreateThread}
                className="mt-3 rounded-lg border border-neutral-200 bg-white p-4"
              >
                <label className="block text-sm font-medium text-neutral-800">
                  Start a thread
                </label>
                <textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  rows={3}
                  placeholder="Add a comment about this version..."
                  className="mt-2 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingComment || !commentDraft.trim()}
                    className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {submittingComment ? "Posting..." : "Post comment"}
                  </button>
                </div>
              </form>

              {commentsLoading ? (
                <p className="mt-4 text-sm text-neutral-500">Loading comments...</p>
              ) : threads.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
                  No comments yet for this version.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {threads.map((thread) => (
                    <div
                      key={thread.id}
                      className="rounded-lg border border-neutral-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-neutral-900">
                            {thread.firstComment
                              ? authorName(thread.firstComment.author)
                              : authorName(thread.author)}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
                            {thread.firstComment?.body ?? "Thread without content"}
                          </p>
                          <div className="mt-2 text-xs text-neutral-500">
                            {formatDateTime(thread.firstComment?.createdAt ?? thread.createdAt)}
                            {" · "}
                            {thread.replyCount} replies
                          </div>
                        </div>
                        <button
                          onClick={() => handleOpenThread(thread.id)}
                          className="shrink-0 text-sm font-medium text-neutral-700 underline underline-offset-2"
                        >
                          {expandedThreadId === thread.id ? "Hide" : "Open"}
                        </button>
                      </div>

                      {expandedThreadId === thread.id && expandedThread && (
                        <div className="mt-4 border-t border-neutral-100 pt-4">
                          <div className="space-y-3">
                            {expandedThread.comments.map((comment) => (
                              <div
                                key={comment.id}
                                className="rounded-md bg-neutral-50 p-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-sm font-medium text-neutral-900">
                                    {authorName(comment.author)}
                                  </span>
                                  <span className="text-xs text-neutral-500">
                                    {formatDateTime(comment.createdAt)}
                                  </span>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
                                  {comment.body}
                                </p>
                              </div>
                            ))}
                          </div>

                          <form onSubmit={handleReply} className="mt-4">
                            <label className="block text-sm font-medium text-neutral-800">
                              Reply to thread
                            </label>
                            <textarea
                              value={replyDraft}
                              onChange={(e) => setReplyDraft(e.target.value)}
                              rows={3}
                              placeholder="Write a reply..."
                              className="mt-2 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                            />
                            <div className="mt-3 flex justify-end">
                              <button
                                type="submit"
                                disabled={submittingReply || !replyDraft.trim()}
                                className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                              >
                                {submittingReply ? "Posting..." : "Post reply"}
                              </button>
                            </div>
                          </form>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
