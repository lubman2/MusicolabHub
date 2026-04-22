"use client";

import { Nav } from "@/components/nav";
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
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function uploaderName(uploader: FileUploader): string {
  return uploader.profile?.displayName || uploader.email;
}

const FILE_TYPE_ICONS: Record<string, string> = {
  audio: "♪",
  image: "🖼",
  application: "📄",
  text: "📝",
};

function fileTypeIcon(mimeType: string): string {
  const category = mimeType.split("/")[0];
  return FILE_TYPE_ICONS[category] ?? "📎";
}

type SortField = "filename" | "fileSize" | "createdAt";

export default function FilesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const page = Number(searchParams.get("page")) || 1;
  const sort = (searchParams.get("sort") as SortField) || "createdAt";
  const order = searchParams.get("order") || "desc";

  const [resp, setResp] = useState<FilesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

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
    if (sort !== "createdAt") qs.set("sort", sort);
    if (order !== "desc") qs.set("order", order);
    const q = qs.toString();
    router.push(`/projects/${projectId}/files${q ? `?${q}` : ""}`);
  }

  function toggleSort(field: SortField) {
    const qs = new URLSearchParams();
    qs.set("sort", field);
    qs.set("order", sort === field && order === "asc" ? "desc" : "asc");
    const q = qs.toString();
    router.push(`/projects/${projectId}/files${q ? `?${q}` : ""}`);
  }

  function sortIndicator(field: SortField): string {
    if (sort !== field) return "";
    return order === "asc" ? " ↑" : " ↓";
  }

  async function handleDownload(fileId: string) {
    setDownloading(fileId);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/files/${fileId}/download`,
      );
      if (!res.ok) return;
      const data = await res.json();
      window.open(data.downloadUrl, "_blank");
    } finally {
      setDownloading(null);
    }
  }

  const files = resp?.data ?? [];
  const pagination = resp?.pagination;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold">Files</h1>

        {loading ? (
          <p className="mt-8 text-sm text-neutral-500">Loading...</p>
        ) : files.length === 0 ? (
          <p className="mt-8 text-sm text-neutral-500">No files found.</p>
        ) : (
          <>
            {/* File table */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs font-medium text-neutral-500 uppercase">
                    <th className="pb-2 pr-4">
                      <button
                        onClick={() => toggleSort("filename")}
                        className="hover:text-neutral-800"
                      >
                        Name{sortIndicator("filename")}
                      </button>
                    </th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">
                      <button
                        onClick={() => toggleSort("fileSize")}
                        className="hover:text-neutral-800"
                      >
                        Size{sortIndicator("fileSize")}
                      </button>
                    </th>
                    <th className="pb-2 pr-4">Uploader</th>
                    <th className="pb-2 pr-4">
                      <button
                        onClick={() => toggleSort("createdAt")}
                        className="hover:text-neutral-800"
                      >
                        Date{sortIndicator("createdAt")}
                      </button>
                    </th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr
                      key={f.id}
                      className="border-b border-neutral-100 hover:bg-neutral-50"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-base">
                            {fileTypeIcon(f.mimeType)}
                          </span>
                          <span className="truncate font-medium text-neutral-900">
                            {f.filename}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-neutral-600">
                        {f.mimeType.split("/")[1]}
                      </td>
                      <td className="py-3 pr-4 text-neutral-600 whitespace-nowrap">
                        {formatSize(f.fileSize)}
                      </td>
                      <td className="py-3 pr-4 text-neutral-600 truncate">
                        {uploaderName(f.uploader)}
                      </td>
                      <td className="py-3 pr-4 text-neutral-500 whitespace-nowrap">
                        {formatDate(f.createdAt)}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => handleDownload(f.id)}
                          disabled={downloading === f.id}
                          className="rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
                        >
                          {downloading === f.id ? "..." : "Download"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-neutral-600">
                  {page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= pagination.totalPages}
                  className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-40"
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
