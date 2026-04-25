import Link from "next/link";

export function AdminForbidden() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-600">
          403 · Forbidden
        </p>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900">
          Admin access required
        </h1>
        <p className="mt-3 text-sm text-neutral-600">
          Your account does not have permission to view this area. If you
          believe this is a mistake, contact a platform administrator.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
