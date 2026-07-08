"use client";

import { useState, useRef, useCallback } from "react";

/** Allowed file extensions per PRD §8.1 */
const ALLOWED_EXTENSIONS = new Set([
  ".mp3", ".wav", ".aiff", ".zip", ".pdf", ".txt", ".docx", ".png", ".jpg", ".jpeg",
]);

const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg", "audio/wav", "audio/wave", "audio/x-wav",
  "audio/aiff", "audio/x-aiff",
  "application/zip", "application/x-zip-compressed",
  "application/pdf", "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png", "image/jpeg",
]);

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_CONCURRENT_UPLOADS = 3;

type UploadStatus = "pending" | "uploading" | "success" | "error";

interface FileUploadState {
  file: File;
  id: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  fileId?: string;
}

interface BatchFileUploadProps {
  projectId: string;
  onUploadComplete?: (successCount: number, failedCount: number) => void;
  /** Fired once when every file settles, with the fileIds that uploaded successfully. */
  onFilesUploaded?: (fileIds: string[]) => void;
  className?: string;
}

export function BatchFileUpload({
  projectId,
  onUploadComplete,
  onFilesUploaded,
  className = "",
}: BatchFileUploadProps) {
  const [files, setFiles] = useState<FileUploadState[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadQueueRef = useRef<Set<string>>(new Set());

  const validateFile = (file: File): string | null => {
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return `File type ${ext} not allowed`;
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return `File size must be between 1 byte and 2GB`;
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return `MIME type ${file.type} not allowed`;
    }
    return null;
  };

  const addFiles = (newFiles: File[]) => {
    const fileStates: FileUploadState[] = newFiles.map((file) => {
      const error = validateFile(file);
      return {
        file,
        id: `${Date.now()}-${Math.random()}`,
        status: error ? ("error" as const) : ("pending" as const),
        progress: 0,
        error: error || undefined,
      };
    });

    setFiles((prev) => [...prev, ...fileStates]);

    // Start uploading valid files
    fileStates
      .filter((f) => f.status === "pending")
      .forEach((f) => uploadFile(f));
  };

  const uploadFile = async (fileState: FileUploadState) => {
    const fileStateId = fileState.id;

    // Wait for a free slot in the upload queue
    while (uploadQueueRef.current.size >= MAX_CONCURRENT_UPLOADS) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    uploadQueueRef.current.add(fileStateId);

    try {

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileStateId ? { ...f, status: "uploading" as const } : f
        )
      );

      // Step 1: Get presigned URL
      const urlRes = await fetch(`/api/projects/${projectId}/files/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: fileState.file.name,
          mimeType: fileState.file.type,
          fileSize: fileState.file.size,
        }),
      });

      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({ error: "Failed to get upload URL" }));
        throw new Error(err.error || "Failed to get upload URL");
      }

      const { uploadUrl, fileId } = await urlRes.json();

      // Step 2: Upload to S3 with progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setFiles((prev) =>
              prev.map((f) => (f.id === fileStateId ? { ...f, progress } : f))
            );
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error during upload"));
        });

        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", fileState.file.type);
        xhr.send(fileState.file);
      });

      // Step 3: Confirm upload
      const confirmRes = await fetch(`/api/projects/${projectId}/files/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });

      if (!confirmRes.ok) {
        const err = await confirmRes.json().catch(() => ({ error: "Failed to confirm upload" }));
        throw new Error(err.error || "Failed to confirm upload");
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileStateId
            ? { ...f, status: "success" as const, progress: 100, fileId }
            : f
        )
      );
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileStateId
            ? {
                ...f,
                status: "error" as const,
                error: error instanceof Error ? error.message : "Upload failed",
              }
            : f
        )
      );
    } finally {
      uploadQueueRef.current.delete(fileStateId);

      // Check if all uploads are done
      setFiles((currentFiles) => {
        const allDone = currentFiles.every((f) =>
          ["success", "error"].includes(f.status)
        );
        if (allDone && currentFiles.length > 0) {
          const successCount = currentFiles.filter((f) => f.status === "success").length;
          const failedCount = currentFiles.filter((f) => f.status === "error").length;
          onUploadComplete?.(successCount, failedCount);

          const uploadedIds = currentFiles
            .filter((f) => f.status === "success" && f.fileId)
            .map((f) => f.fileId as string);
          if (uploadedIds.length > 0) {
            onFilesUploaded?.(uploadedIds);
          }
        }
        return currentFiles;
      });
    }
  };

  const retryFile = (fileStateId: string) => {
    setFiles((prev) => {
      const updated = prev.map((f) =>
        f.id === fileStateId
          ? { ...f, status: "pending" as const, progress: 0, error: undefined }
          : f
      );
      const fileState = updated.find((f) => f.id === fileStateId);
      if (fileState) {
        uploadFile(fileState);
      }
      return updated;
    });
  };

  const removeFile = (fileStateId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileStateId));
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      addFiles(selectedFiles);
    }
    // Reset input to allow re-selecting the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openFileSelector = () => {
    fileInputRef.current?.click();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getStatusIcon = (status: UploadStatus) => {
    switch (status) {
      case "pending":
        return "⏳";
      case "uploading":
        return "⬆️";
      case "success":
        return "✅";
      case "error":
        return "❌";
    }
  };

  return (
    <div className={className}>
      {/* Drop zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-50"
            : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
          accept={Array.from(ALLOWED_EXTENSIONS).join(",")}
        />

        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-700">
            Drag and drop files here, or
          </p>
          <button
            type="button"
            onClick={openFileSelector}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Browse Files
          </button>
          <p className="text-xs text-neutral-500">
            Max 2GB per file. Allowed: MP3, WAV, AIFF, ZIP, PDF, TXT, DOCX, PNG, JPG
          </p>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-medium text-neutral-700">
            Files ({files.length})
          </h3>

          {files.map((fileState) => (
            <div
              key={fileState.id}
              className="rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getStatusIcon(fileState.status)}</span>
                    <h4 className="truncate text-sm font-medium text-neutral-900">
                      {fileState.file.name}
                    </h4>
                  </div>

                  <p className="mt-1 text-xs text-neutral-500">
                    {formatFileSize(fileState.file.size)}
                  </p>

                  {fileState.status === "uploading" && (
                    <div className="mt-2">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                        <div
                          className="h-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${fileState.progress}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">
                        {fileState.progress}%
                      </p>
                    </div>
                  )}

                  {fileState.error && (
                    <p className="mt-1 text-xs text-red-600">{fileState.error}</p>
                  )}
                </div>

                <div className="flex shrink-0 gap-2">
                  {fileState.status === "error" && (
                    <button
                      onClick={() => retryFile(fileState.id)}
                      className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Retry
                    </button>
                  )}

                  {["pending", "error", "success"].includes(fileState.status) && (
                    <button
                      onClick={() => removeFile(fileState.id)}
                      className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
