"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useEffect, useState } from "react";

interface EditableProfile {
  userId: string;
  displayName: string | null;
  headline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  skills: string[];
  genres: string[];
  priceRange: string | null;
}

interface SessionUser {
  id: string;
  email: string;
}

export default function ProfileSettingsPage() {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<EditableProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [skillsInput, setSkillsInput] = useState("");
  const [genresInput, setGenresInput] = useState("");
  const [priceRange, setPriceRange] = useState("");

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetch("/api/auth/me"), fetch("/api/profile")]).then(
      async ([meRes, profileRes]) => {
        if (cancelled) return;

        if (!meRes.ok || !profileRes.ok) {
          setError("You need to be signed in to edit your profile.");
          setLoading(false);
          return;
        }

        const meBody = (await meRes.json()) as { user: SessionUser };
        const profileBody = (await profileRes.json()) as EditableProfile;

        setCurrentUser(meBody.user);
        setProfile(profileBody);
        setDisplayName(profileBody.displayName ?? "");
        setHeadline(profileBody.headline ?? "");
        setBio(profileBody.bio ?? "");
        setAvatarUrl(profileBody.avatarUrl ?? "");
        setSkillsInput(profileBody.skills.join(", "));
        setGenresInput(profileBody.genres.join(", "));
        setPriceRange(profileBody.priceRange ?? "");
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const toList = (value: string) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        headline,
        bio,
        avatarUrl,
        priceRange,
        skills: toList(skillsInput),
        genres: toList(genresInput),
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to update profile");
      setSaving(false);
      return;
    }

    const updated = (await res.json()) as EditableProfile;
    setProfile(updated);
    setSuccess("Profile updated.");
    setSaving(false);
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Profile settings</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Edit your public creator profile.
            </p>
          </div>
          {currentUser && (
            <Link
              href={`/profile/${currentUser.id}`}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              View public profile
            </Link>
          )}
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-neutral-500">Loading...</p>
        ) : error && !profile ? (
          <p className="mt-8 text-sm text-red-600">{error}</p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-6 rounded-2xl border border-neutral-200 bg-white p-6"
          >
            <FormField label="Display name">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </FormField>

            <FormField label="Headline">
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Producer | Mixer | Vocal editor"
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </FormField>

            <FormField label="Bio">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={6}
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </FormField>

            <FormField label="Avatar URL">
              <input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Placeholder input for avatar image until upload flow is added.
              </p>
            </FormField>

            <div className="grid gap-6 md:grid-cols-2">
              <FormField label="Skills">
                <input
                  value={skillsInput}
                  onChange={(e) => setSkillsInput(e.target.value)}
                  placeholder="mixing, vocal production, mastering"
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                />
              </FormField>

              <FormField label="Genres">
                <input
                  value={genresInput}
                  onChange={(e) => setGenresInput(e.target.value)}
                  placeholder="pop, indie, house"
                  className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                />
              </FormField>
            </div>

            <FormField label="Price range">
              <input
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value)}
                placeholder="€150–€400 per track"
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </FormField>

            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4">
              <h2 className="text-sm font-semibold text-neutral-900">Portfolio</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Portfolio samples and links are intentionally left as a placeholder in
                this pass. The profile flow now exposes where they belong without
                inventing a half-backed schema.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-700">{success}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save profile"}
              </button>
            </div>
          </form>
        )}
      </main>
    </>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-800">{label}</span>
      {children}
    </label>
  );
}
