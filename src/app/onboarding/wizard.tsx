"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";

interface InitialProfile {
  displayName: string | null;
  headline: string | null;
  bio: string | null;
  skills: string[];
  genres: string[];
}

interface Props {
  initial: InitialProfile | null;
}

const MAX_DISPLAY_NAME = 80;
const MAX_HEADLINE = 120;
const MAX_BIO = 2000;

export function OnboardingWizard({ initial }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [headline, setHeadline] = useState(initial?.headline ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? []);
  const [genres, setGenres] = useState<string[]>(initial?.genres ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goToStep2(event: FormEvent) {
    event.preventDefault();
    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }
    setError(null);
    setStep(2);
  }

  async function submit(skipOptional: boolean) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const payload = {
      displayName: displayName.trim(),
      headline: headline.trim() || null,
      bio: bio.trim() || null,
      skills: skipOptional ? [] : skills,
      genres: skipOptional ? [] : genres,
    };

    try {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to save onboarding");
        setSubmitting(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Network error, please try again");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Welcome to MusicCollabHub</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Tell us about yourself so collaborators can find you.
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
          <span className={step === 1 ? "font-semibold text-neutral-900" : ""}>
            1. Profile
          </span>
          <span>→</span>
          <span className={step === 2 ? "font-semibold text-neutral-900" : ""}>
            2. Skills & genres
          </span>
        </div>
      </header>

      {step === 1 ? (
        <form onSubmit={goToStep2} className="space-y-4">
          <Field label="Display name" required>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={MAX_DISPLAY_NAME}
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              placeholder="How others will see you"
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
              rows={4}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              placeholder="A short introduction"
            />
          </Field>

          {error && <ErrorBox message={error} />}

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Continue
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <Field label="Skills">
            <TagInput
              tags={skills}
              onChange={setSkills}
              placeholder="e.g. mixing, vocals, guitar"
            />
          </Field>
          <Field label="Genres">
            <TagInput
              tags={genres}
              onChange={setGenres}
              placeholder="e.g. hip-hop, jazz, ambient"
            />
          </Field>

          {error && <ErrorBox message={error} />}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="text-sm text-neutral-600 hover:text-neutral-900 disabled:opacity-50"
            >
              ← Back
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={submitting}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={submitting}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Finish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {message}
    </div>
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
