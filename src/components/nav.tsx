import Link from "next/link";

export function Nav() {
  return (
    <nav className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold">
          MusicCollabHub
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-neutral-600 hover:text-neutral-900"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800"
          >
            Sign up
          </Link>
        </div>
      </div>
    </nav>
  );
}
