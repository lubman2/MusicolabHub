import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }
  return (
    <>
      <Nav />
      <main className="flex flex-1 flex-col items-center justify-center px-4">
        <h1 className="text-4xl font-bold tracking-tight">MusicCollabHub</h1>
        <p className="mt-4 max-w-md text-center text-lg text-neutral-600">
          Secure collaboration workspace for music creators. Manage projects,
          files, versions, and contributor splits in one place.
        </p>
      </main>
    </>
  );
}
