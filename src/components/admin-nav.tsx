"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AdminSection = {
  href: string;
  label: string;
  exact?: boolean;
};

const SECTIONS: readonly AdminSection[] = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/audit", label: "Audit Log" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-neutral-200 bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link
          href="/admin"
          className="text-lg font-semibold tracking-tight text-white"
        >
          MusicCollabHub · Admin
        </Link>
        <div className="flex items-center gap-1">
          {SECTIONS.map((section) => {
            const active = section.exact
              ? pathname === section.href
              : pathname === section.href ||
                pathname.startsWith(`${section.href}/`);
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                }`}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto">
          <Link
            href="/dashboard"
            className="text-sm text-neutral-300 hover:text-white"
          >
            Exit admin
          </Link>
        </div>
      </div>
    </nav>
  );
}
