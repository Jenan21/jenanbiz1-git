"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

const publicRoutes = new Set(["/", "/auth", "/login", "/register"]);

/**
 * A small entry to /admin for administrators on every member page, so the owner never has to type the address.
 * It asks once per page change, shows nothing to anyone else, and stays off the public pages, the admin area
 * (which has its own navigation) and the home, whose header already carries the link.
 */
export function AdminEntryLink() {
  const pathname = usePathname();
  const [admin, setAdmin] = useState(false);
  const hidden = publicRoutes.has(pathname) || pathname === "/dashboard" || pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/auth/");

  useEffect(() => {
    if (hidden) return;
    const controller = new AbortController();
    fetch("/api/auth/admin-access", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ admin?: boolean }>) : null))
      .then((payload) => setAdmin(payload?.admin === true))
      .catch(() => undefined);
    return () => controller.abort();
  }, [hidden, pathname]);

  if (hidden || !admin) return null;
  return (
    <Link className="admin-entry-link" data-testid="admin-entry-link" href="/admin">
      <Icon name="shield" />
      <span lang="ar">الإدارة</span>
      <span lang="en">Admin</span>
    </Link>
  );
}
