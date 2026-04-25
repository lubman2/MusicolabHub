import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
import { loadAdminUser } from "@/lib/admin";
import { AdminForbidden } from "./forbidden";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin · MusicCollabHub",
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await loadAdminUser();
  if (!user) return <AdminForbidden />;

  return (
    <div className="min-h-full bg-neutral-50">
      <AdminNav />
      <main className="mx-auto w-full max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
