import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { href, ...rest }, children),
}));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: ({ label }: { label: string }) => createElement("button", { className: "logout-button", type: "button" }, label),
}));
vi.mock("@/components/ui/language-switcher", () => ({
  LanguageSwitcher: () => createElement("button", { className: "language-switcher", type: "button" }, "EN"),
}));

import { AuthenticatedHome } from "@/components/dashboard/authenticated-home";

type Role = Parameters<typeof AuthenticatedHome>[0]["systemRole"];

function render(role: Role, locale: "ar" | "en" = "ar", label = "Jane Founder") {
  return renderToStaticMarkup(createElement(AuthenticatedHome, { locale, systemRole: role, userLabel: label }));
}

describe("signed-in home", () => {
  it("offers the six sections of the reference, each with a working route", () => {
    const html = render("USER");
    const cards = [...html.matchAll(/<a href="([^"]+)" class="authenticated-home__service /g)].map((match) => match[1]);
    expect(cards).toEqual(["/projects", "/academy", "/software", "/market", "/talent", "/user/investments"]);
    expect(html).toContain('data-dashboard-source="AUTHENTICATED_PLATFORM"');
    expect(html).toContain('data-dashboard-route="/dashboard"');
  });

  it("shows the admin entry and an owner label only to administrators", () => {
    expect(render("USER")).not.toContain('data-testid="home-admin-link"');
    expect(render("EMPLOYEE")).not.toContain('data-testid="home-admin-link"');
    for (const role of ["ADMIN", "SUPER_ADMIN"] as const) {
      expect(render(role)).toMatch(/<a [^>]*data-testid="home-admin-link"[^>]*href="\/admin"|<a [^>]*href="\/admin"[^>]*data-testid="home-admin-link"/);
    }
    expect(render("SUPER_ADMIN")).toContain("مالك المنصة");
    expect(render("ADMIN")).toContain("مدير النظام");
    expect(render("USER")).toContain(">عضو<");
    expect(render("SUPER_ADMIN", "en")).toContain("Platform owner");
    expect(render("USER", "en")).toContain(">Member<");
  });

  it("keeps one profile name and one logout button", () => {
    const html = render("USER", "en", "Jane Founder");
    expect(html.match(/class="user-chip"/g)).toHaveLength(1);
    expect(html).toContain(">Jane Founder<");
    expect(html.match(/logout-button/g)).toHaveLength(1);
  });

  it("invents no figures: no percentages, no signs, no live prices, and the unsupported controls are disabled", () => {
    for (const locale of ["ar", "en"] as const) {
      const html = render("SUPER_ADMIN", locale);
      expect(html).not.toMatch(/[+-]\d+(\.\d+)?%|\d%|7,659|83,902/);
      expect(html.match(/<strong>—<\/strong>/g)).toHaveLength(3);
      expect(html).toMatch(/<input[^>]*disabled/);
      expect(html).toMatch(/<button[^>]*authenticated-home__bell[^>]*disabled|<button[^>]*disabled[^>]*authenticated-home__bell/);
      expect(html).not.toContain("<video");
      expect(html).not.toMatch(/funding/i);
    }
  });

  it("states the heading and the three actions of the reference", () => {
    const html = render("USER");
    expect(html).toContain("مستقبل");
    expect(html).toContain("يبدأ");
    expect(html).toContain("استكشف الخدمات");
    expect(html).toContain("لوحة بياناتي");
    expect(html).toContain("ابدأ الآن");
    expect(html).toContain('href="/user"');
    expect(html).toContain('id="services"');
  });
});
