"use client";

import { Nav } from "@/components/nav";
import { FileUpload } from "@/components/file-upload";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
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

function uploaderName(uploader: FileUploader): string {
  return uploader.profile?.displayName || uploader.email;
}

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-green-100 text-green-800",
  uploading: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  ready: "Připraven",
  uploading: "Nahrává se",
  failed: "Chyba",
};

export default function FilesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get("page")) || 1;
  const showAll = searchParams.get("status") === "all";

  const [resp, setResp] = useState<FilesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ page: String(page), limit: "20" });
    if (showAll) qs.set("status", "all");

    try {
      const res = await fetch(`/api/projects/${projectId}/files?${qs}`);
      if (res.ok) {
        setResp(await res.json());
      } else {
        setError("Nepodařilo se načíst soubory");
      }
    } catch (err) {
      setError("Chyba při načítání souborů");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [projectId, page, showAll]);

  const handleUploadComplete = () => {
    fetchFiles();
  };

  const handleDownload = async (fileId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${fileId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.downloadUrl) {
          window.open(data.downloadUrl, "_blank");
        } else {
          alert("Soubor ještě není připraven ke stažení");
        }
      } else {
        alert("Nepodařilo se načíst informace o souboru");
      }
    } catch (err) {
      alert("Chyba při stahování souboru");
    }
  };

  if (loading && !resp) {
    return (
      <>
        <Nav />
        <main className="max-w-6xl mx-auto p-6">
          <p className="text-neutral-500">Načítání...</p>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Nav />
        <main className="max-w-6xl mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
            <button
              onClick={fetchFiles}
              className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
            >
              Zkusit znovu
            </button>
          </div>
        </main>
      </>
    );
  }

  const { data: files = [], pagination } = resp || {};

  return (
    <>
      <Nav />
      <main className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Soubory</h1>
          <div className="flex gap-2">
            <Link
              href={`/projects/${projectId}/files?status=${showAll ? "ready" : "all"}`}
              className="px-4 py-2 text-sm border rounded-md hover:bg-neutral-50"
            >
              {showAll ? "Jen připravené" : "Všechny stavy"}
            </Link>
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              {showUpload ? "Skrýt upload" : "Nahrát soubory"}
            </button>
          </div>
        </div>

        {/* Upload section */}
        {showUpload && (
          <div className="mb-8 bg-neutral-50 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Nahrát nové soubory</h2>
            <FileUpload projectId={projectId} onUploadComplete={handleUploadComplete} />
          </div>
        )}

        {/* Files list */}
        {files.length === 0 ? (
          <div className="text-center py-12 bg-neutral-50 rounded-lg">
            <p className="text-neutral-600">
              Žádné soubory. Nahrajte první soubor pomocí tlačítka výše.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Název</th>
                    <th className="text-left px-4 py-3 font-medium">Typ</th>
                    <th className="text-left px-4 py-3 font-medium">Velikost</th>
                    <th className="text-left px-4 py-3 font-medium">Stav</th>
                    <th className="text-left px-4 py-3 font-medium">Nahrál</th>
                    <th className="text-left px-4 py-3 font-medium">Datum</th>
                    <th className="text-left px-4 py-3 font-medium">Akce</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {files.map((file) => (
                    <tr key={file.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <div className="font-medium truncate max-w-xs">
                          {file.originalName}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {file.mimeType.split("/")[1]?.toUpperCase() || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {formatFileSize(file.fileSize)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            STATUS_STYLES[file.status] || "bg-neutral-100 text-neutral-800"
                          }`}
                        >
                          {STATUS_LABELS[file.status] || file.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {uploaderName(file.uploader)}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {formatDate(file.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {file.status === "ready" && (
                          <button
                            onClick={() => handleDownload(file.id)}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            Stáhnout
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-6 flex justify-center gap-2">
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(
                  (p) => (
                    <Link
                      key={p}
                      href={`/projects/${projectId}/files?page=${p}${
                        showAll ? "&status=all" : ""
                      }`}
                      className={`px-3 py-1 border rounded ${
                        p === page
                          ? "bg-blue-600 text-white border-blue-600"
                          : "hover:bg-neutral-50"
                      }`}
                    >
                      {p}
                    </Link>
                  ),
                )}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
