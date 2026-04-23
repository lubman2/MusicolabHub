"use client";

import { Nav } from "@/components/nav";
import { MultiFileUpload } from "@/components/multi-file-upload";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface FileUploader {
  id: string;
  email: string;
  profile: { displayName: string | null } | null;
}

interface ProjectFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  uploader: FileUploader;
}

interface FilesResponse {
  data: ProjectFile[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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

function uploaderName(uploader: FileUploader): string {
  return uploader.profile?.displayName || uploader.email;
}

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-green-100 text-green-800",
  uploading: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  ready: "Připraveno",
  uploading: "Nahrává se",
  failed: "Chyba",
};

export default function FilesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const projectId = params.id as string;
  const currentPage = parseInt(searchParams.get("page") ?? "1", 10);

  const [data, setData] = useState<FilesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const fetchFiles = async (page: number = currentPage) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/files?page=${page}&limit=20`
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Nepodařilo se načíst soubory");
      }

      const json: FilesResponse = await res.json();
      setData(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Neznámá chyba";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(currentPage);
  }, [projectId, currentPage]);

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`/projects/${projectId}/files?${params.toString()}`);
  };

  const handleDownload = async (fileId: string, filename: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${fileId}`);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Nepodařilo se získat soubor");
      }

      const fileData = await res.json();

      if (!fileData.downloadUrl) {
        throw new Error("Soubor není připraven ke stažení");
      }

      // Open download URL in new tab
      window.open(fileData.downloadUrl, "_blank");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Neznámá chyba";
      alert(`Chyba při stahování: ${message}`);
    }
  };

  const handleUploadComplete = () => {
    setShowUpload(false);
    fetchFiles(1); // Refresh list from page 1
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <Nav />

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">
              Soubory projektu
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
              <Link
                href={`/projects/${projectId}`}
                className="hover:text-neutral-700"
              >
                ← Zpět na projekt
              </Link>
            </div>
          </div>

          <button
            onClick={() => setShowUpload(!showUpload)}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800"
          >
            {showUpload ? "Skrýt nahrávání" : "Nahrát soubory"}
          </button>
        </div>

        {/* Upload section */}
        {showUpload && (
          <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-neutral-900">
              Nahrát nové soubory
            </h2>
            <MultiFileUpload
              projectId={projectId}
              onUploadComplete={handleUploadComplete}
            />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && !data && (
          <div className="flex items-center justify-center py-12">
            <div className="text-neutral-500">Načítání...</div>
          </div>
        )}

        {/* Files list */}
        {data && (
          <>
            {data.data.length === 0 ? (
              <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-neutral-500">
                {showUpload
                  ? "Zatím nejsou nahrány žádné soubory. Použijte formulář výše."
                  : "Zatím nejsou nahrány žádné soubory."}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                  <table className="w-full">
                    <thead className="border-b border-neutral-200 bg-neutral-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-600">
                          Název souboru
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-600">
                          Velikost
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-600">
                          Nahrál
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-600">
                          Datum
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-600">
                          Stav
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-600">
                          Akce
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {data.data.map((file) => (
                        <tr key={file.id} className="hover:bg-neutral-50">
                          <td className="px-4 py-3 text-sm text-neutral-900">
                            <div className="font-medium">{file.originalName}</div>
                            <div className="text-xs text-neutral-500">
                              {file.mimeType}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-600">
                            {formatBytes(file.fileSize)}
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-600">
                            {uploaderName(file.uploader)}
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-600">
                            {formatDate(file.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                                STATUS_STYLES[file.status] ||
                                "bg-neutral-100 text-neutral-800"
                              }`}
                            >
                              {STATUS_LABELS[file.status] || file.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {file.status === "ready" ? (
                              <button
                                onClick={() =>
                                  handleDownload(file.id, file.originalName)
                                }
                                className="text-sm text-blue-600 hover:text-blue-800"
                              >
                                Stáhnout
                              </button>
                            ) : (
                              <span className="text-sm text-neutral-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {data.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3">
                    <div className="text-sm text-neutral-600">
                      Stránka {data.pagination.page} z{" "}
                      {data.pagination.totalPages} (celkem {data.pagination.total}{" "}
                      souborů)
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          handlePageChange(data.pagination.page - 1)
                        }
                        disabled={data.pagination.page === 1}
                        className="rounded-md border border-neutral-300 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 hover:bg-neutral-50"
                      >
                        Předchozí
                      </button>
                      <button
                        onClick={() =>
                          handlePageChange(data.pagination.page + 1)
                        }
                        disabled={
                          data.pagination.page >= data.pagination.totalPages
                        }
                        className="rounded-md border border-neutral-300 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 hover:bg-neutral-50"
                      >
                        Další
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
