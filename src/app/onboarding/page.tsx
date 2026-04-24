import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { OnboardingWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      status: true,
      profile: {
        select: {
          displayName: true,
          headline: true,
          bio: true,
          skills: true,
          genres: true,
        },
      },
    },
  });

  if (!user) redirect("/login");
  if (user.status === "unverified") redirect("/login");
  if (user.status === "suspended") redirect("/login");
  if (user.status === "onboarded") redirect("/dashboard");

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <OnboardingWizard initial={user.profile ?? null} />
    </main>
  );
}
