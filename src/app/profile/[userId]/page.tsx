import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { resolveAvatarUrl } from "@/lib/profile";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ userId: string }>;
}

export default async function PublicProfilePage({ params }: Props) {
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      profile: {
        select: {
          displayName: true,
          headline: true,
          bio: true,
          avatarUrl: true,
          skills: true,
          genres: true,
          portfolioSamples: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              title: true,
              url: true,
              mimeType: true,
            },
          },
        },
      },
    },
  });

  if (
    !user ||
    !user.profile ||
    user.status === "suspended" ||
    user.status === "unverified"
  ) {
    notFound();
  }

  const session = await getSession();
  const isOwn = session?.userId === user.id;
  const avatarUrl = await resolveAvatarUrl(user.profile.avatarUrl);
  const displayName = user.profile.displayName ?? "Unnamed";

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full bg-neutral-100">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={`${displayName} avatar`}
                fill
                sizes="128px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-neutral-400">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">
                  {displayName}
                </h1>
                {user.profile.headline && (
                  <p className="mt-1 text-sm text-neutral-600">
                    {user.profile.headline}
                  </p>
                )}
              </div>
              {isOwn && (
                <Link
                  href="/settings/profile"
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Edit profile
                </Link>
              )}
            </div>

            {user.profile.bio && (
              <p className="mt-4 whitespace-pre-line text-sm text-neutral-700">
                {user.profile.bio}
              </p>
            )}

            {user.profile.skills.length > 0 && (
              <Section title="Skills">
                <TagList tags={user.profile.skills} />
              </Section>
            )}
            {user.profile.genres.length > 0 && (
              <Section title="Genres">
                <TagList tags={user.profile.genres} />
              </Section>
            )}

            <Section title="Portfolio">
              {user.profile.portfolioSamples.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  No portfolio samples yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {user.profile.portfolioSamples.map((sample) => (
                    <li
                      key={sample.id}
                      className="rounded-md border border-neutral-200 px-3 py-2"
                    >
                      <a
                        href={sample.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm font-medium text-neutral-900 hover:underline"
                      >
                        {sample.title}
                      </a>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                        <span className="truncate">{sample.url}</span>
                        {sample.mimeType && (
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5">
                            {sample.mimeType}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </header>
      </main>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function TagList({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
