"use client";

import { useState, useRef } from "react";

interface FileUploadProps {
  projectId: string;
  onUploadComplete?: () => void;
}

interface FileStatus {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
}

const ALLOWED_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/aiff",
  "audio/x-aiff",
  "application/zip",
  "application/x-zip-compressed",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
];

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

export function FileUpload({ projectId, onUploadComplete }: FileUploadProps) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | undefined => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `Nepodporovaný typ souboru: ${file.type}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `Soubor je příliš velký (max 2GB)`;
    }
    return undefined;
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;

    const newFiles: FileStatus[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const error = validateFile(file);
      newFiles.push({
        file,
        status: error ? "error" : "pending",
        progress: 0,
        error,
      });
    }

    setFiles((prev) => [...prev, ...newFiles]);

    // Start uploading valid files
    newFiles.forEach((fileStatus, index) => {
      if (fileStatus.status === "pending") {
        uploadFile(fileStatus, files.length + index);
      }
    });
  };

  const uploadFile = async (fileStatus: FileStatus, index: number) => {
    const { file } = fileStatus;

    try {
      // Update status to uploading
      setFiles((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status: "uploading", progress: 0 };
        return updated;
      });

      // Step 1: Request presigned upload URL
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
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadRes.ok) {
        throw new Error("Upload do S3 selhal");
      }

      setFiles((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], progress: 50 };
        return updated;
      });

      // Step 3: Confirm upload
      const confirmRes = await fetch(`/api/projects/${projectId}/files/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });

      if (!confirmRes.ok) {
        const error = await confirmRes.json();
        throw new Error(error.error || "Potvrzení uploadu selhalo");
      }

      const result = await confirmRes.json();

      if (result.status !== "ready") {
        throw new Error("Soubor nebyl úspěšně nahrán do úložiště");
      }

      setFiles((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status: "success", progress: 100 };
        return updated;
      });

      onUploadComplete?.();
    } catch (err) {
      setFiles((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          status: "error",
          error: err instanceof Error ? err.message : "Neznámá chyba",
        };
        return updated;
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Retry button: re-upload a failed file from scratch
  const retryFile = async (fileStatus: FileStatus, index: number) => {
    setFiles((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status: "pending", progress: 0, error: undefined };
      return updated;
    });
    await uploadFile({ ...fileStatus, status: "pending", error: undefined }, index);
  };

  const clearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status === "uploading" || f.status === "pending"));
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors
          ${isDragging ? "border-blue-500 bg-blue-50" : "border-neutral-300 hover:border-neutral-400"}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
          accept=".mp3,.wav,.aiff,.zip,.pdf,.txt,.docx,.png,.jpg,.jpeg"
        />
        <p className="text-neutral-600">
          Přetáhněte soubory sem nebo klikněte pro výběr
        </p>
        <p className="text-sm text-neutral-500 mt-2">
          Podporované: MP3, WAV, AIFF, ZIP, PDF, TXT, DOCX, PNG, JPG (max 2GB)
        </p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Soubory ({files.length})</h3>
            <button
              onClick={clearCompleted}
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              Vymazat dokončené
            </button>
          </div>

          {files.map((fileStatus, index) => (
            <div
              key={index}
              className="border rounded-lg p-3 bg-white"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{fileStatus.file.name}</p>
                  <p className="text-sm text-neutral-500">
                    {formatFileSize(fileStatus.file.size)}
                  </p>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  {fileStatus.status === "pending" && (
                    <span className="text-sm text-neutral-500">Čeká...</span>
                  )}
                  {fileStatus.status === "uploading" && (
                    <span className="text-sm text-blue-600">Nahrává se...</span>
                  )}
                  {fileStatus.status === "success" && (
                    <span className="text-sm text-green-600">✓ Hotovo</span>
                  )}
                  {fileStatus.status === "error" && (
                    <span className="text-sm text-red-600">✗ Chyba</span>
                  )}
                  {fileStatus.status === "error" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        retryFile(fileStatus, index);
                      }}
                      className="ml-2 text-xs text-blue-600 hover:text-blue-800"
                    >
                      Zkusit znovu
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {fileStatus.status === "uploading" && (
                <div className="w-full bg-neutral-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${fileStatus.progress}%` }}
                  />
                </div>
              )}

              {/* Error message */}
              {fileStatus.error && (
                <p className="text-sm text-red-600 mt-2">{fileStatus.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
