"use client";

import { useState, useCallback } from "react";

interface UploadingFile {
  file: File;
  id: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
}

interface MultiFileUploadProps {
  projectId: string;
  onUploadComplete?: () => void;
}

const ALLOWED_EXTENSIONS = [
  ".mp3", ".wav", ".aiff", ".zip", ".pdf", ".txt", ".docx", ".png", ".jpg", ".jpeg"
];

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

export function MultiFileUpload({ projectId, onUploadComplete }: MultiFileUploadProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const validateFile = (file: File): string | null => {
    const ext = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Nepodporovaný typ souboru: ${ext}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `Soubor je příliš velký (max 2GB): ${formatBytes(file.size)}`;
    }
    return null;
  };

  const uploadFile = useCallback(async (uploadingFile: UploadingFile) => {
    const { file, id } = uploadingFile;

    try {
      // Step 1: Get presigned upload URL
      setUploadingFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "uploading", progress: 0 } : f))
      );

      const urlRes = await fetch(`/api/projects/${projectId}/files/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });

      if (!urlRes.ok) {
        const error = await urlRes.json();
        throw new Error(error.error || "Nepodařilo se získat upload URL");
      }

      const { uploadUrl, fileId } = await urlRes.json();

      // Step 2: Upload to S3
      setUploadingFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, progress: 25 } : f))
      );

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadRes.ok) {
        throw new Error("Nahrání do S3 selhalo");
      }

      setUploadingFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, progress: 75 } : f))
      );

      // Step 3: Confirm upload
      const confirmRes = await fetch(`/api/projects/${projectId}/files/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });

      if (!confirmRes.ok) {
        const error = await confirmRes.json();
        throw new Error(error.error || "Potvrzení nahrání selhalo");
      }

      const result = await confirmRes.json();

      if (result.status !== "ready") {
        throw new Error(`Soubor nebyl nalezen v úložišti (status: ${result.status})`);
      }

      setUploadingFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "success", progress: 100 } : f))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Neznámá chyba";
      setUploadingFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "error", error: message } : f))
      );
    }
  }, [projectId]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const newFiles: UploadingFile[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const error = validateFile(file);

        newFiles.push({
          file,
          id: `${Date.now()}-${i}`,
          status: error ? "error" : "pending",
          progress: 0,
          error: error || undefined,
        });
      }

      setUploadingFiles((prev) => [...prev, ...newFiles]);

      // Upload all valid files in parallel
      const validFiles = newFiles.filter((f) => f.status === "pending");
      await Promise.all(validFiles.map((f) => uploadFile(f)));

      // Call completion callback after uploads finish
      if (onUploadComplete) {
        onUploadComplete();
      }
    },
    [onUploadComplete, uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const clearCompleted = () => {
    setUploadingFiles((prev) => prev.filter((f) => f.status !== "success"));
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${isDragging ? "border-blue-500 bg-blue-50" : "border-neutral-300 bg-neutral-50"}
        `}
      >
        <input
          type="file"
          multiple
          id="file-input"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          accept={ALLOWED_EXTENSIONS.join(",")}
        />
        <label
          htmlFor="file-input"
          className="cursor-pointer flex flex-col items-center gap-2"
        >
          <div className="text-4xl text-neutral-400">📁</div>
          <div className="text-sm text-neutral-600">
            Přetáhněte soubory sem nebo <span className="text-blue-600 underline">klikněte pro výběr</span>
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            Podporované typy: {ALLOWED_EXTENSIONS.join(", ")} (max 2GB)
          </div>
        </label>
      </div>

      {/* Upload list */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-neutral-700">
              Soubory ({uploadingFiles.length})
            </h3>
            {uploadingFiles.some((f) => f.status === "success") && (
              <button
                onClick={clearCompleted}
                className="text-xs text-neutral-500 hover:text-neutral-700"
              >
                Vymazat dokončené
              </button>
            )}
          </div>

          <div className="space-y-2">
            {uploadingFiles.map((uf) => (
              <div
                key={uf.id}
                className="border border-neutral-200 rounded-lg p-3 bg-white"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-900 truncate">
                      {uf.file.name}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {formatBytes(uf.file.size)}
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {uf.status === "pending" && (
                      <span className="text-xs text-amber-600">⏳ Čeká</span>
                    )}
                    {uf.status === "uploading" && (
                      <span className="text-xs text-blue-600">↑ {uf.progress}%</span>
                    )}
                    {uf.status === "success" && (
                      <span className="text-xs text-green-600">✓ Hotovo</span>
                    )}
                    {uf.status === "error" && (
                      <span className="text-xs text-red-600">✗ Chyba</span>
                    )}
                  </div>
                </div>

                {uf.status === "uploading" && (
                  <div className="mt-2 w-full bg-neutral-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${uf.progress}%` }}
                    />
                  </div>
                )}

                {uf.error && (
                  <div className="mt-2 text-xs text-red-600">{uf.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
