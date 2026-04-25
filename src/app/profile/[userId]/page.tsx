import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveAvatarUrl } from "@/lib/profile";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      profile: {
        select: {
          displayName: true,
          headline: true,
          bio: true,
          avatarUrl: true,
          skills: true,
          genres: true,
        },
      },
    },
  });

  if (
    !user ||
    user.status === "suspended" ||
    user.status !== "onboarded" ||
    !user.profile
  ) {
    notFound();
  }

  const avatarUrl = await resolveAvatarUrl(user.profile.avatarUrl);
  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <header className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <Avatar
            url={avatarUrl}
            name={user.profile.displayName ?? "User"}
            size={112}
          />
          <div>
            <h1 className="text-2xl font-bold">
              {user.profile.displayName ?? "Unnamed user"}
            </h1>
            {user.profile.headline && (
              <p className="mt-1 text-sm text-neutral-600">
                {user.profile.headline}
              </p>
            )}
            <p className="mt-2 text-xs text-neutral-400">
              Member since {memberSince}
            </p>
          </div>
        </header>

        {user.profile.bio && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              About
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">
              {user.profile.bio}
            </p>
          </section>
        )}

        {user.profile.skills.length > 0 && (
          <TagSection title="Skills" tags={user.profile.skills} />
        )}

        {user.profile.genres.length > 0 && (
          <TagSection title="Genres" tags={user.profile.genres} />
        )}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Portfolio
          </h2>
          <div className="mt-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
            Portfolio samples coming soon.
          </div>
        </section>
      </main>
    </>
  );
}

function TagSection({ title, tags }: { title: string; tags: string[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700"
          >
            {tag}
          </span>
        ))}
      </div>
    </section>
  );
}

function Avatar({
  url,
  name,
  size,
}: {
  url: string | null;
  name: string;
  size: number;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`${name}'s avatar`}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="flex items-center justify-center rounded-full bg-neutral-200 text-2xl font-semibold text-neutral-500"
      style={{ width: size, height: size }}
      aria-label={`${name}'s avatar`}
    >
      {initial}
    </div>
  );
}
