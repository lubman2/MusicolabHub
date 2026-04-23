"use client";

import { Nav } from "@/components/nav";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface PublicProfileResponse {
  id: string;
  email: string;
  profile: {
    displayName: string | null;
    headline: string | null;
    bio: string | null;
    avatarUrl: string | null;
    skills: string[];
    genres: string[];
    priceRange: string | null;
  };
}

export default function CreatorProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const [data, setData] = useState<PublicProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/users/${userId}/profile`).then(async (res) => {
      if (cancelled) return;

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Failed to load profile");
        setLoading(false);
        return;
      }

      setData(await res.json());
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const profile = data?.profile;
  const name = profile?.displayName || data?.email || "Creator";

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : error || !data || !profile ? (
          <p className="text-sm text-red-600">{error || "Profile not found."}</p>
        ) : (
          <>
            <section className="rounded-2xl border border-neutral-200 bg-white p-6">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-2xl font-semibold text-neutral-500">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    name.charAt(0).toUpperCase()
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h1 className="text-3xl font-bold text-neutral-900">{name}</h1>
                  <p className="mt-2 text-sm text-neutral-500">{data.email}</p>
                  {profile.headline && (
                    <p className="mt-4 text-lg text-neutral-700">{profile.headline}</p>
                  )}
                  {profile.priceRange && (
                    <p className="mt-3 text-sm text-neutral-600">
                      Typical price range: {profile.priceRange}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-6 md:grid-cols-[2fr_1fr]">
              <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-neutral-900">About</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                  {profile.bio || "No bio added yet."}
                </p>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                  <h2 className="text-lg font-semibold text-neutral-900">Skills</h2>
                  <TagList items={profile.skills} emptyLabel="No skills listed yet." />
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                  <h2 className="text-lg font-semibold text-neutral-900">Genres</h2>
                  <TagList items={profile.genres} emptyLabel="No genres listed yet." />
                </div>

                <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6">
                  <h2 className="text-lg font-semibold text-neutral-900">Portfolio</h2>
                  <p className="mt-3 text-sm text-neutral-600">
                    Portfolio samples are planned in a follow-up step. This page keeps
                    the placeholder visible so the profile flow matches the PRD shape.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function TagList({
  items,
  emptyLabel,
}: {
  items: string[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="mt-3 text-sm text-neutral-500">{emptyLabel}</p>;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
