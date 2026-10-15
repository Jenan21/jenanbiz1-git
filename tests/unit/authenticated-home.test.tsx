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
import type { HomeStats } from "@/services/platform/home-stats-service";

type Role = Parameters<typeof AuthenticatedHome>[0]["systemRole"];

function render(role: Role, locale: "ar" | "en" = "ar", label = "Jane Founder", stats: HomeStats = { activeUsers: 1, projects: 3 }) {
  return renderToStaticMarkup(createElement(AuthenticatedHome, { locale, stats, systemRole: role, userLabel: label }));
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

  it("keeps one profile name that opens the account, and one logout button", () => {
    const html = render("USER", "en", "Jane Founder");
    expect(html.match(/class="user-chip"/g)).toHaveLength(1);
    expect(html).toContain(">Jane Founder<");
    expect(html).toContain('href="/user"');
    expect(html.match(/logout-button/g)).toHaveLength(1);
  });

  it("shows only the two real counts and a dash everywhere else, with no invented figures", () => {
    for (const locale of ["ar", "en"] as const) {
      const html = render("SUPER_ADMIN", locale, "Owner", { activeUsers: 7, projects: 1320 });
      expect(html).toMatch(/data-testid="home-active-users">7</);
      expect(html).toMatch(/data-testid="home-active-projects">1,320</);
      // Growth, opportunities, investments, countries and the three market quotes have no source.
      expect(html.match(/<strong class="is-empty">—<\/strong>/g)).toHaveLength(4);
      expect(html.match(/<strong>—<\/strong>/g)).toHaveLength(3);
      for (const invented of ["+32%", "+18%", "12,450", "248", "12.4M", "5,021", "+2.18%", "+0.62%", "+1.24%"]) {
        expect(html, invented).not.toContain(invented);
      }
      expect(html).not.toMatch(/[+-]\d+(\.\d+)?%/);
      expect(html).not.toContain("<video");
      expect(html).not.toMatch(/funding/i);
    }
  });

  it("says a count is unavailable when it could not be read", () => {
    const html = render("USER", "en", "Jane", { activeUsers: null, projects: null });
    expect(html).toMatch(/data-testid="home-active-users">—</);
    expect(html).toMatch(/data-testid="home-active-projects">—</);
    expect(html.match(/Unavailable/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("disables what has no feature behind it: notifications and the video", () => {
    for (const locale of ["ar", "en"] as const) {
      const html = render("USER", locale);
      expect(html).toMatch(/<button[^>]*authenticated-home__bell[^>]*disabled|<button[^>]*disabled[^>]*authenticated-home__bell/);
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^]*?(شاهد الفيديو|Watch the video)/);
      expect(html).not.toMatch(/<input/);
    }
  });

  it("states the heading and the actions of the reference", () => {
    const html = render("USER");
    expect(html).toContain("مستقبل");
    expect(html).toContain("يبدأ");
    expect(html).toContain("من الفكرة إلى النمو ... معك في كل خطوة");
    expect(html).toContain("استكشف الخدمات");
    expect(html).toContain("ابدأ الآن");
    expect(html).toContain("شاهد الفيديو");
    expect(html).toContain('id="services"');
    expect(html).toContain('href="/projects/analysis"');
  });
});
