import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }), usePathname: () => "/dashboard" }));
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

  it("gives every card an icon, a watermark of the city photo and a large faint icon", () => {
    const html = render("USER");
    expect(html.match(/authenticated-home__service-icon/g)).toHaveLength(6);
    expect(html.match(/authenticated-home__photo/g)).toHaveLength(6);
    expect(html.match(/authenticated-home__watermark/g)).toHaveLength(6);
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

  it("invents no figure: the markets say unavailable and nothing carries a percentage or a price", () => {
    for (const locale of ["ar", "en"] as const) {
      const html = render("SUPER_ADMIN", locale);
      expect(html.match(/authenticated-home__market-name/g)).toHaveLength(3);
      expect(html.match(/<strong>—<\/strong>/g)).toHaveLength(3);
      const markets = html.slice(html.indexOf("authenticated-home__markets"), html.indexOf("<footer"));
      expect(markets.match(locale === "ar" ? /غير متاح/g : /Unavailable/g)).toHaveLength(3);
      for (const invented of ["68,412", "2,352", "5,137", "+2.45%", "+1.18%", "+0.84%", "12.4M", "1,320", "248", "+32%"]) {
        expect(html, invented).not.toContain(invented);
      }
      const visibleText = html.replace(/<[^>]*>/g, " ");
      expect(visibleText).not.toMatch(/[+-]\s?\d+(\.\d+)?\s?%/);
      expect(visibleText).not.toMatch(/\d[\d,.]*\s?(M|K|B)\b/);
      expect(html).not.toContain("<video");
      expect(html).not.toMatch(/funding/i);
    }
  });

  it("disables the notifications, which have no feature behind them", () => {
    const html = render("USER");
    expect(html).toMatch(/<button[^>]*jenan-header__bell[^>]*disabled|<button[^>]*disabled[^>]*jenan-header__bell/);
  });

  it("has the headline, the two actions and a working search in the hero", () => {
    const html = render("USER");
    expect(html).toContain("مستقبل");
    expect(html).toContain("يبدأ");
    expect(html).toContain("استكشف الخدمات");
    expect(html).toContain("ابدأ الآن");
    expect(html).toContain('id="services"');
    expect(html).toContain('data-testid="home-search"');
    expect(html).toMatch(/<input[^>]*role="combobox"/);
    expect(html).not.toMatch(/<input[^>]*disabled/);
  });

  it("keeps the four strengths and shows the same content in English", () => {
    const html = render("USER", "en");
    expect(html.match(/authenticated-home__strength-icon/g)).toHaveLength(4);
    expect(html).toContain("Connected sections");
    expect(html).toContain("The <span class=\"is-cyan\">future</span>");
    expect(html).toContain("Explore services");
  });
});
