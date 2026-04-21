import { Nav } from "@/components/nav";

export default function LoginPage() {
  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <h1 className="text-2xl font-bold">Log in</h1>
          <p className="text-sm text-neutral-500">Placeholder — EPIC-01</p>
        </div>
      </main>
    </>
  );
}
