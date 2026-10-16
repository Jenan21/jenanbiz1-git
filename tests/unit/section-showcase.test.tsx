import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: () => undefined, push: () => undefined }), usePathname: () => "/software" }));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: ({ label }: { label: string }) => createElement("button", { className: "logout-button", type: "button" }, label),
}));
vi.mock("@/components/ui/language-switcher", () => ({
  LanguageSwitcher: () => createElement("button", { className: "language-switcher", type: "button" }, "EN"),
}));

import { SectionShowcase } from "@/components/shell/section-showcase";
import { AUTHORITATIVE_UI_ROUTES } from "@/lib/platform/authoritative-ui-routes";
import {
  ACADEMY_SHOWCASE,
  MARKET_SHOWCASE,
  MARKETING_SHOWCASE,
  SOFTWARE_SHOWCASE,
  TALENT_SHOWCASE,
} from "@/lib/navigation/section-showcases";

const showcases = { ACADEMY_SHOWCASE, MARKET_SHOWCASE, MARKETING_SHOWCASE, SOFTWARE_SHOWCASE, TALENT_SHOWCASE };
const known = new Set(AUTHORITATIVE_UI_ROUTES.map((route) => route.path));

describe("section showcase pages", () => {
  for (const [name, content] of Object.entries(showcases)) {
    it(`${name} links only to pages that exist, once each`, () => {
      const panelHrefs = content.panels.flatMap((panel) => (panel.kind === "live" ? [panel.href] : panel.kind === "links" ? panel.items.map((item) => item.href) : []));
      const hrefs = [content.primary.href, content.secondary?.href, ...content.services.map((service) => service.href), ...panelHrefs].filter((href): href is string => Boolean(href));
      for (const href of hrefs) expect(known.has(href), href).toBe(true);
      const tiles = content.services.map((service) => service.href);
      expect(new Set(tiles).size).toBe(tiles.length);
      expect(JSON.stringify(content)).not.toMatch(/funding|تمويل/i);
    });

    it(`${name} renders the shared header, the headline and every service in both languages`, () => {
      for (const locale of ["ar", "en"] as const) {
        const html = renderToStaticMarkup(createElement(SectionShowcase, { ...content, locale, userLabel: "Jane" }));
        expect(html).toContain('data-testid="jenan-header"');
        expect(html).toContain(`data-showcase-route="${content.route}"`);
        expect(html).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
        expect(html).toContain(content.title[1][locale === "ar" ? 0 : 1]);
        expect([...html.matchAll(/class="showcase__tile /g)]).toHaveLength(content.services.length);
      }
    });
  }

  it("keeps the marker the Software route checks", () => {
    const html = renderToStaticMarkup(createElement(SectionShowcase, { ...SOFTWARE_SHOWCASE, locale: "en", userLabel: "Jane" }));
    expect(html).toContain('data-software-route="/software"');
  });
});
