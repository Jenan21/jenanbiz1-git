"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { backFallback, homePath, showsAdminEntry, showsShortcuts } from "@/lib/navigation/page-shortcuts";

interface Access {
  signedIn: boolean | null;
  admin: boolean;
}

/**
 * Back, home and (for administrators) the way into /admin, on every page of the platform that has no such control of
 * its own. "Back" returns to the previous page of the platform when there is one, otherwise to the page's section.
 */
export function PageShortcuts() {
  const pathname = usePathname();
  const router = useRouter();
  const [access, setAccess] = useState<Access>({ signedIn: null, admin: false });
  const visible = showsShortcuts(pathname);

  // How many pages of the platform were opened before this one in this tab, so that "back" never leaves the platform.
  const depth = useRef(0);
  const first = useRef(true);
  const poppedAt = useRef(0);
  useEffect(() => {
    const onPop = () => { poppedAt.current = Date.now(); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const popped = Date.now() - poppedAt.current < 1500;
    poppedAt.current = 0;
    depth.current = popped ? Math.max(0, depth.current - 1) : depth.current + 1;
  }, [pathname]);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    fetch("/api/auth/admin-access", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) return { signedIn: false, admin: false };
        if (!response.ok) return null;
        const payload = (await response.json()) as { admin?: boolean };
        return { signedIn: true, admin: payload.admin === true };
      })
      .then((next) => { if (next) setAccess(next); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [visible, pathname]);

  if (!visible) return null;

  function goBack() {
    if (depth.current > 0) router.back();
    else router.push(backFallback(pathname, access.signedIn));
  }

  return (
    <div className="page-shortcuts" data-testid="page-shortcuts">
      <button className="page-shortcuts__item" data-testid="shortcut-back" onClick={goBack} type="button">
        <Icon name="arrow" className="page-shortcuts__back" />
        <span className="page-shortcuts__label" lang="ar">رجوع</span>
        <span className="page-shortcuts__label" lang="en">Back</span>
      </button>
      <Link className="page-shortcuts__item" data-testid="shortcut-home" href={homePath(access.signedIn)}>
        <Icon name="dashboard" />
        <span className="page-shortcuts__label" lang="ar">الرئيسية</span>
        <span className="page-shortcuts__label" lang="en">Home</span>
      </Link>
      {showsAdminEntry(pathname, access.admin) ? (
        <Link className="page-shortcuts__item is-admin" data-testid="admin-entry-link" href="/admin">
          <Icon name="shield" />
          <span className="page-shortcuts__label" lang="ar">الإدارة</span>
          <span className="page-shortcuts__label" lang="en">Admin</span>
        </Link>
      ) : null}
    </div>
  );
}
