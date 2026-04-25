import Link from "next/link";

const SECTIONS = [
  {
    href: "/admin/users",
    title: "Users",
    description: "Search accounts, suspend or restore users.",
  },
  {
    href: "/admin/projects",
    title: "Projects",
    description: "Inspect projects, restrict or restore content.",
  },
  {
    href: "/admin/payments",
    title: "Payments",
    description: "Hold or release payouts, review marketplace activity.",
  },
  {
    href: "/admin/audit-log",
    title: "Audit Log",
    description: "Trail of every administrative action with reason codes.",
  },
] as const;

export default function AdminOverviewPage() {
  return (
    <div>
      <header>
        <h1 className="text-2xl font-bold text-neutral-900">Admin overview</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Platform moderation and operations console.
        </p>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-lg border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <h2 className="font-semibold text-neutral-900 group-hover:text-neutral-700">
              {section.title}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {section.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
