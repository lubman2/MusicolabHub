"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";

interface InitialProfile {
  displayName: string;
  headline: string;
  bio: string;
  avatarUrl: string | null;
  avatarKey: string | null;
  skills: string[];
  genres: string[];
}

interface Props {
  userId: string;
  initial: InitialProfile;
}

const MAX_DISPLAY_NAME = 80;
const MAX_HEADLINE = 120;
const MAX_BIO = 2000;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function ProfileForm({ userId, initial }: Props) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [headline, setHeadline] = useState(initial.headline);
  const [bio, setBio] = useState(initial.bio);
  const [skills, setSkills] = useState<string[]>(initial.skills);
  const [genres, setGenres] = useState<string[]>(initial.genres);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initial.avatarUrl,
  );
  const [avatarKey, setAvatarKey] = useState<string | null>(initial.avatarKey);

  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadAvatar(file: File) {
    setError(null);
    setSuccess(false);

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Avatar must be a JPEG or PNG image");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Avatar must be 5 MB or smaller");
      return;
    }

    setUploading(true);
    try {
      const presignRes = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      if (!presignRes.ok) {
        const data = (await presignRes.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to start upload");
        setUploading(false);
        return;
      }
      const { uploadUrl, avatarKey: newKey } = (await presignRes.json()) as {
        uploadUrl: string;
        avatarKey: string;
      };

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        setError("Upload failed, please try again");
        setUploading(false);
        return;
      }

      setAvatarKey(newKey);
      setAvatarPreview(URL.createObjectURL(file));
    } catch {
      setError("Network error, please try again");
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting || uploading) return;
    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          headline: headline.trim() || null,
          bio: bio.trim() || null,
          skills,
          genres,
          avatarKey,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to save profile");
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as {
        profile: { avatarUrl: string | null; avatarKey: string | null };
      };
      setAvatarPreview(data.profile.avatarUrl);
      setAvatarKey(data.profile.avatarKey);
      setSuccess(true);
    } catch {
      setError("Network error, please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 overflow-hidden rounded-full bg-neutral-100">
          {avatarPreview ? (
            <Image
              src={avatarPreview}
              alt="Avatar preview"
              fill
              sizes="80px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-neutral-400">
              {displayName.slice(0, 1).toUpperCase() || "?"}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadAvatar(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || submitting}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Change avatar"}
          </button>
          <p className="text-xs text-neutral-500">JPEG or PNG, up to 5 MB</p>
        </div>
      </div>

      <Field label="Display name" required>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={MAX_DISPLAY_NAME}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </Field>

      <Field label="Headline">
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={MAX_HEADLINE}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          placeholder="e.g. Producer · Berlin"
        />
      </Field>

      <Field label="Bio">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={MAX_BIO}
          rows={5}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </Field>

      <Field label="Skills">
        <TagInput
          tags={skills}
          onChange={setSkills}
          placeholder="e.g. mixing, vocals"
        />
      </Field>

      <Field label="Genres">
        <TagInput
          tags={genres}
          onChange={setGenres}
          placeholder="e.g. hip-hop, jazz"
        />
      </Field>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Profile saved.
        </div>
      )}

      <div className="flex items-center justify-between">
        <Link
          href={`/profile/${userId}`}
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          View public profile →
        </Link>
        <button
          type="submit"
          disabled={submitting || uploading}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      {children}
    </label>
  );
}

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    if (!value) return;
    if (tags.some((t) => t.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...tags, value]);
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-300 px-2 py-1.5 focus-within:border-neutral-900">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-neutral-400 hover:text-neutral-900"
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[8ch] bg-transparent py-0.5 text-sm focus:outline-none"
      />
    </div>
  );
}
