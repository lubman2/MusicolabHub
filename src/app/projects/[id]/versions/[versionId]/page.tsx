"use client";

import { Nav } from "@/components/nav";
import { BatchFileUpload } from "@/components/BatchFileUpload";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Uploader {
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
  uploadedAt: string;
  uploader: Uploader;
  downloadUrl: string | null;
}

interface VersionDetail {
  id: string;
  name: string;
  changelog: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  author: {
    email: string;
    profile: { displayName: string | null } | null;
  };
  files: VersionFile[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function displayName(user: { email: string; profile: { displayName: string | null } | null }): string {
  return user.profile?.displayName || user.email;
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-100 text-green-800",
  draft: "bg-amber-100 text-amber-800",
  superseded: "bg-neutral-100 text-neutral-600",
};

export default function VersionDetailPage() {
  const { id: projectId, versionId } = useParams<{ id: string; versionId: string }>();
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/projects/${projectId}/versions/${versionId}`)
      .then(async (res) => {
        if (cancelled) return;

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed to load version" }));
          throw new Error(err.error || "Failed to load version");
        }

        const data = await res.json();
        setVersion(data);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load version");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, versionId, reloadTrigger]);

  const handleUploadComplete = (successCount: number) => {
    if (successCount > 0) {
      setReloadTrigger((prev) => prev + 1);
    }
  };

  const isDraft = version?.status === "draft";
  const isSuperseded = version?.status === "superseded";

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Breadcrumb */}
        <div className="mb-6 text-sm text-neutral-500">
          <Link href={`/projects/${projectId}/versions`} className="hover:text-neutral-700">
            Versions
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-900">{version?.name || "Loading..."}</span>
        </div>

        {loading && <p className="text-sm text-neutral-500">Loading...</p>}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {version && (
          <>
            {isSuperseded && (
              <div className="mb-6 rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                This version has been superseded by a newer published version.
              </div>
            )}

            {/* Version header */}
            <div className="rounded-lg border border-neutral-200 bg-white p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-neutral-900">{version.name}</h1>
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                        STATUS_STYLES[version.status] ?? "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {version.status}
                    </span>
                  </div>
                  {version.changelog && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600">
                      {version.changelog}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-500">
                <div>
                  <span className="font-medium">Created:</span>{" "}
                  {formatDate(version.createdAt)}
                </div>
                {version.publishedAt && (
                  <div>
                    <span className="font-medium">Published:</span>{" "}
                    {formatDate(version.publishedAt)}
                  </div>
                )}
                <div>
                  <span className="font-medium">Author:</span> {displayName(version.author)}
                </div>
              </div>
            </div>

            {/* File upload — drafts only (immutability for published/superseded) */}
            {isDraft && (
              <div className="mt-8">
                <h2 className="mb-4 text-lg font-semibold text-neutral-900">Upload Files</h2>
                <BatchFileUpload
                  projectId={projectId}
                  onUploadComplete={handleUploadComplete}
                />
              </div>
            )}

            {/* Files table */}
            <div className="mt-8">
              <h2 className="mb-4 text-lg font-semibold text-neutral-900">
                Files ({version.files.length})
              </h2>

              {version.files.length === 0 ? (
                <p className="text-sm text-neutral-500">No files in this version.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                      <tr>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2">Size</th>
                        <th className="px-4 py-2 text-right">Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {version.files.map((f) => (
                        <tr key={f.id}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-neutral-900">
                              {f.originalName}
                            </div>
                            <div className="mt-0.5 text-xs text-neutral-500">
                              Uploaded {formatDate(f.uploadedAt)} by {displayName(f.uploader)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-neutral-600">{f.mimeType}</td>
                          <td className="px-4 py-3 text-neutral-600">
                            {formatFileSize(f.fileSize)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {f.downloadUrl ? (
                              <a
                                href={f.downloadUrl}
                                className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                                download
                              >
                                Download
                              </a>
                            ) : (
                              <span className="text-xs text-neutral-400">{f.status}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
