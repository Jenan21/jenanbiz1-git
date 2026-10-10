"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { normalizeHiddenInterfacePaths } from "@/lib/account/interface-visibility";

export const INTERFACE_VISIBILITY_EVENT = "jenan:interface-visibility";

const publicRoutes = new Set(["/", "/auth", "/login", "/register"]);

function selectorFor(path: string) {
  const quotedPath = JSON.stringify(path);
  return [
    `[data-personalizable-path=${quotedPath}]`,
    `a[href=${quotedPath}]`,
  ].join(",");
}

export function InterfaceVisibilityProvider() {
  const pathname = usePathname();
  const [hiddenPaths, setHiddenPaths] = useState<string[]>([]);

  useEffect(() => {
    if (publicRoutes.has(pathname)) return;
    const controller = new AbortController();
    void fetch("/api/account/interface-visibility", {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (response.status === 401) return;
      const payload = await response.json().catch(() => null) as { hiddenPaths?: unknown; message?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? "Unable to load interface preferences");
      setHiddenPaths(normalizeHiddenInterfacePaths(payload?.hiddenPaths));
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Unable to load interface visibility preferences", error);
    });
    return () => controller.abort();
  }, [pathname]);

  useEffect(() => {
    function handleVisibilityUpdate(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail;
      setHiddenPaths(normalizeHiddenInterfacePaths(detail));
    }
    window.addEventListener(INTERFACE_VISIBILITY_EVENT, handleVisibilityUpdate);
    return () => window.removeEventListener(INTERFACE_VISIBILITY_EVENT, handleVisibilityUpdate);
  }, []);

  const rules = useMemo(
    () => hiddenPaths.map((path) => `${selectorFor(path)}{display:none!important}`).join("\n"),
    [hiddenPaths],
  );

  return rules ? <style data-interface-visibility>{rules}</style> : null;
}
