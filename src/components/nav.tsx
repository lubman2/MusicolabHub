"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBell } from "./notification-bell";

type UserInfo = { email: string } | null;

const PRIMARY_LINKS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Projekty" },
  { href: "/gigs", label: "Marketplace" },
  { href: "/settings/profile", label: "Nastavení" },
];

function isActiveLink(pathname: string, href: string): boolean {
  if (href === "/settings/profile") return pathname.startsWith("/settings");
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/projects");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname() ?? "";
  const [user, setUser] = useState<UserInfo>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        setUser(data?.user ? { email: data.user.email } : null);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <nav className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="text-lg font-semibold">MusicCollabHub</div>
          <div className="text-sm text-neutral-400">Loading...</div>
        </div>
      </nav>
    );
  }

  if (user) {
    // Authenticated nav
    return (
      <nav className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-semibold">
              MusicCollabHub
            </Link>
            <div className="flex items-center gap-1">
              {PRIMARY_LINKS.map((link) => {
                const active = isActiveLink(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-neutral-100 text-neutral-900"
                        : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <span className="text-sm text-neutral-500">{user.email}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              Odhlásit se
            </button>
          </div>
        </div>
      </nav>
    );
  }

  // Public nav
  return (
    <nav className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold">
          MusicCollabHub
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell />
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
