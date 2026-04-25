import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { resolveAvatarUrl } from "@/lib/profile";
import { ProfileSettingsForm } from "./profile-form";

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
  if (user.status !== "onboarded") redirect("/onboarding");

  const avatarUrl = await resolveAvatarUrl(user.profile?.avatarUrl);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Profile settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Update how others see you on MusicCollabHub.
        </p>
      </header>
      <ProfileSettingsForm
        userId={user.id}
        initial={{
          displayName: user.profile?.displayName ?? "",
          headline: user.profile?.headline ?? "",
          bio: user.profile?.bio ?? "",
          skills: user.profile?.skills ?? [],
          genres: user.profile?.genres ?? [],
          avatarUrl,
        }}
      />
    </main>
  );
}
