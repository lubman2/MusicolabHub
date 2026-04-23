"use client";

import { Nav } from "@/components/nav";
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
  createdAt: string;
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
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function uploaderName(uploader: FileUploader): string {
  return uploader.profile?.displayName || uploader.email;
}

function getFileTypeLabel(mimeType: string): string {
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType.startsWith("image/")) return "Obrázek";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "application/zip" || mimeType === "application/x-zip-compressed") return "ZIP";
  if (mimeType.startsWith("text/")) return "Text";
  if (mimeType.includes("wordprocessing")) return "DOCX";
  return "Soubor";
}

export default function FilesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const page = Number(searchParams.get("page")) || 1;
  const sort = searchParams.get("sort") || "date";
  const order = searchParams.get("order") || "desc";

  const [resp, setResp] = useState<FilesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({
      page: String(page),
      limit: "20",
      sort,
      order,
    });

    fetch(`/api/projects/${projectId}/files?${qs}`).then(async (res) => {
      if (cancelled) return;
      if (res.ok) setResp(await res.json());
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, page, sort, order]);

  function goToPage(p: number) {
    const qs = new URLSearchParams();
    if (p > 1) qs.set("page", String(p));
    if (sort !== "date") qs.set("sort", sort);
    if (order !== "desc") qs.set("order", order);
    const q = qs.toString();
    router.push(`/projects/${projectId}/files${q ? `?${q}` : ""}`);
  }

  function changeSort(newSort: string) {
    const qs = new URLSearchParams();
    qs.set("sort", newSort);
    if (order !== "desc") qs.set("order", order);
    router.push(`/projects/${projectId}/files?${qs}`);
  }

  function toggleOrder() {
    const qs = new URLSearchParams();
    if (sort !== "date") qs.set("sort", sort);
    qs.set("order", order === "asc" ? "desc" : "asc");
    router.push(`/projects/${projectId}/files?${qs}`);
  }

  async function handleDownload(file: ProjectFile) {
    setDownloading(file.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${file.id}/download`);
      if (!res.ok) {
        alert("Chyba při stahování souboru");
        return;
      }
      const { downloadUrl, filename } = await res.json();

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      alert("Chyba při stahování souboru");
    } finally {
      setDownloading(null);
    }
  }

  const files = resp?.data ?? [];
  const pagination = resp?.pagination;

  return (
    <>
      <Nav />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Soubory projektu</h1>
          <Link
            href={`/projects/${projectId}`}
            className="text-sm text-neutral-600 hover:text-neutral-900"
          >
            ← Zpět na projekt
          </Link>
        </div>

        {loading && <p className="text-neutral-500">Načítání...</p>}

        {!loading && files.length === 0 && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
            <p className="text-neutral-600">Žádné soubory</p>
          </div>
        )}

        {!loading && files.length > 0 && (
          <>
            <div className="mb-4 flex items-center gap-4 text-sm">
              <span className="text-neutral-600">Řazení:</span>
              <button
                onClick={() => changeSort("name")}
                className={`rounded px-2 py-1 ${
                  sort === "name" ? "bg-blue-100 text-blue-800" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                Název
              </button>
              <button
                onClick={() => changeSort("size")}
                className={`rounded px-2 py-1 ${
                  sort === "size" ? "bg-blue-100 text-blue-800" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                Velikost
              </button>
              <button
                onClick={() => changeSort("date")}
                className={`rounded px-2 py-1 ${
                  sort === "date" ? "bg-blue-100 text-blue-800" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                Datum
              </button>
              <button
                onClick={toggleOrder}
                className="ml-2 text-neutral-600 hover:text-neutral-900"
              >
                {order === "asc" ? "↑" : "↓"}
              </button>
            </div>

            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:bg-neutral-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="rounded bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                        {getFileTypeLabel(file.mimeType)}
                      </span>
                      <h3 className="font-medium">{file.originalName}</h3>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-neutral-600">
                      <span>{formatFileSize(file.fileSize)}</span>
                      <span>•</span>
                      <span>{uploaderName(file.uploader)}</span>
                      <span>•</span>
                      <span>{formatDate(file.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(file)}
                    disabled={downloading === file.id}
                    className="ml-4 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-neutral-400"
                  >
                    {downloading === file.id ? "Stahuji..." : "Stáhnout"}
                  </button>
                </div>
              ))}
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-50"
                >
                  ← Předchozí
                </button>
                <span className="text-sm text-neutral-600">
                  Stránka {pagination.page} z {pagination.totalPages}
                </span>
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= pagination.totalPages}
                  className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-50"
                >
                  Další →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
