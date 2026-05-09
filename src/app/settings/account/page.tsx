import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { AccountActions } from "./account-actions";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, status: true },
  });

  if (!user) redirect("/login");
  if (user.status === "unverified") redirect("/login");
  if (user.status === "suspended") redirect("/login");

  const requests = await prisma.accountRequest.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      type: true,
      status: true,
      verifiedAt: true,
      scheduledFor: true,
      completedAt: true,
      cancelledAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

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
          <h1 className="text-2xl font-bold">Account</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Export a copy of your data or permanently delete your account.
          </p>
        </header>

        <div className="mt-8">
          <AccountActions
            email={user.email}
            initialRequests={requests.map((r) => ({
              id: r.id,
              type: r.type,
              status: r.status,
              verifiedAt: r.verifiedAt?.toISOString() ?? null,
              scheduledFor: r.scheduledFor?.toISOString() ?? null,
              completedAt: r.completedAt?.toISOString() ?? null,
              cancelledAt: r.cancelledAt?.toISOString() ?? null,
              createdAt: r.createdAt.toISOString(),
            }))}
          />
        </div>
      </main>
    </>
  );
}
