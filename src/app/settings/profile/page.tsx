import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { resolveAvatarUrl } from "@/lib/profile";
import { ProfileForm } from "./profile-form";
import { PortfolioSamples } from "./portfolio-samples";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      status: true,
      profile: {
        select: {
          id: true,
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
              sortOrder: true,
            },
          },
        },
      },
    },
  });

  if (!user) redirect("/login");
  if (user.status === "unverified") redirect("/login");
  if (user.status === "suspended") redirect("/login");

  const avatarUrl = await resolveAvatarUrl(user.profile?.avatarUrl ?? null);

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <Link
          href="/dashboard"
          className="mb-4 inline-block text-sm text-neutral-600 hover:underline"
        >
          ← Dashboard
        </Link>
        <header>
          <h1 className="text-2xl font-bold">Profile settings</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Update your public profile.
          </p>
        </header>

        <div className="mt-8">
          <ProfileForm
            userId={user.id}
            initial={{
              displayName: user.profile?.displayName ?? "",
              headline: user.profile?.headline ?? "",
              bio: user.profile?.bio ?? "",
              avatarUrl,
              avatarKey: user.profile?.avatarUrl ?? null,
              skills: user.profile?.skills ?? [],
              genres: user.profile?.genres ?? [],
            }}
          />
        </div>

        <section className="mt-12">
          <h2 className="text-lg font-semibold text-neutral-900">Portfolio</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Up to 10 work samples or links shown on your public profile.
          </p>
          <div className="mt-4">
            <PortfolioSamples initial={user.profile?.portfolioSamples ?? []} />
          </div>
        </section>
      </main>
    </>
  );
}
