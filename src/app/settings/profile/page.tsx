import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { resolveAvatarUrl } from "@/lib/profile";
import { ProfileForm } from "./profile-form";

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

  if (!user) redirect("/login");
  if (user.status === "unverified") redirect("/login");
  if (user.status === "suspended") redirect("/login");

  const avatarUrl = await resolveAvatarUrl(user.profile?.avatarUrl ?? null);

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
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
      </main>
    </>
  );
}
