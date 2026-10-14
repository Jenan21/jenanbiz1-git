import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/projects/analysis" }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ back: () => undefined, push: () => undefined }) }));

import { PageShortcuts } from "@/components/navigation/page-shortcuts";
import { backFallback, homePath, isPublicRoute, showsAdminEntry, showsShortcuts } from "@/lib/navigation/page-shortcuts";

beforeEach(() => {
  mocks.pathname = "/projects/analysis";
});

describe("where the shortcuts appear", () => {
  it("never touches the frozen pre-entry, sign-in and registration pages or the signed-in home", () => {
    for (const path of ["/", "/auth", "/login", "/register", "/auth/forgot", "/dashboard"]) {
      expect(showsShortcuts(path), path).toBe(false);
    }
    for (const path of ["/", "/auth", "/login", "/register", "/auth/forgot"]) expect(isPublicRoute(path), path).toBe(true);
    expect(isPublicRoute("/dashboard")).toBe(false);
  });

  it("covers every section and child page of the platform", () => {
    for (const path of ["/projects", "/projects/analysis", "/projects/analysis/result", "/academy/courses/c1/lesson/1", "/market", "/talent", "/software", "/marketing", "/robotics", "/programs", "/studio", "/account", "/user/investments", "/pricing", "/benefits", "/admin", "/admin/users"]) {
      expect(showsShortcuts(path), path).toBe(true);
    }
  });

  it("offers the admin entry only to administrators, and not inside the admin area", () => {
    expect(showsAdminEntry("/projects", true)).toBe(true);
    expect(showsAdminEntry("/projects", false)).toBe(false);
    expect(showsAdminEntry("/admin", true)).toBe(false);
    expect(showsAdminEntry("/admin/users", true)).toBe(false);
    expect(showsAdminEntry("/dashboard", true)).toBe(false);
    expect(showsAdminEntry("/login", true)).toBe(false);
  });
});

describe("where the shortcuts lead", () => {
  it("sends home to the signed-in home, or to the public page for a signed-out visitor", () => {
    expect(homePath(true)).toBe("/dashboard");
    expect(homePath(null)).toBe("/dashboard");
    expect(homePath(false)).toBe("/");
  });

  it("falls back to the section of the page, and from a section's first page to the home", () => {
    expect(backFallback("/projects/analysis/result", true)).toBe("/projects");
    expect(backFallback("/academy/courses/c1/lesson/1", true)).toBe("/academy");
    expect(backFallback("/admin/users/", true)).toBe("/admin");
    expect(backFallback("/projects", true)).toBe("/dashboard");
    expect(backFallback("/projects/", true)).toBe("/dashboard");
    expect(backFallback("/pricing", false)).toBe("/");
  });
});

describe("the rendered shortcuts", () => {
  it("shows back and home with both languages on a member page", () => {
    const html = renderToStaticMarkup(createElement(PageShortcuts));
    expect(html).toContain('data-testid="shortcut-back"');
    expect(html).toContain('data-testid="shortcut-home"');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("رجوع");
    expect(html).toContain("Back");
    expect(html).toContain("الرئيسية");
    expect(html).not.toContain("admin-entry-link");
  });

  it("renders nothing on the pages that must stay as designed", () => {
    for (const path of ["/", "/login", "/register", "/auth/forgot", "/dashboard"]) {
      mocks.pathname = path;
      expect(renderToStaticMarkup(createElement(PageShortcuts)), path).toBe("");
    }
  });
});
