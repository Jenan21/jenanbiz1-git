import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRAND_LEAF_SRC,
  CTA_ROCKET_SRC,
  SERVICE_PANELS,
  iconSrc,
  sceneSrc,
  splitHeadline,
  type PanelId,
} from "@/components/home/service-panels";

const root = process.cwd();
const arabic = /[\u0600-\u06FF]/;

// Minimal App Router resolver: exact folders first, then `[param]` and `[...catchAll]` folders.
function resolvesToPage(pathname: string) {
  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) return existsSync(join(dir, "page.tsx"));
    const folders = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const [head, ...tail] = rest;
    const exact = folders.find((entry) => entry.name === head);
    if (exact && walk(join(dir, exact.name), tail)) return true;
    return folders.some((entry) => {
      if (/^\[\.\.\.[^\]]+\]$/.test(entry.name)) return existsSync(join(dir, entry.name, "page.tsx"));
      if (/^\[[^.\]]+\]$/.test(entry.name)) return walk(join(dir, entry.name), tail);
      return false;
    });
  };
  return walk(join(root, "app"), pathname.split("/").filter(Boolean));
}

const texts = SERVICE_PANELS.flatMap((panel) => [
  { id: panel.id, field: "name", value: panel.name },
  { id: panel.id, field: "headline", value: panel.headline },
  { id: panel.id, field: "sub", value: panel.sub },
  { id: panel.id, field: "cta", value: panel.cta.label },
  ...(panel.cta.note ? [{ id: panel.id, field: "cta note", value: panel.cta.note }] : []),
  ...panel.tiles.flatMap((tile, index) => [
    { id: panel.id, field: `tile ${index}`, value: tile.label },
    ...(tile.note ? [{ id: panel.id, field: `tile ${index} note`, value: tile.note }] : []),
  ]),
]);

describe("pre-login service panels", () => {
  it("rotates the seven approved services in their designed order", () => {
    expect(SERVICE_PANELS.map((panel) => panel.id)).toEqual<PanelId[]>([
      "projects",
      "academy",
      "talent",
      "market",
      "software",
      "marketing",
      "tools",
    ]);
  });

  it("gives every panel four tiles and Arabic plus English copy", () => {
    for (const panel of SERVICE_PANELS) expect(panel.tiles).toHaveLength(4);
    for (const { id, field, value } of texts) {
      expect(value[0].trim(), `${id} ${field} (ar)`).not.toBe("");
      expect(value[1].trim(), `${id} ${field} (en)`).not.toBe("");
      expect(arabic.test(value[0]), `${id} ${field} (ar) must be Arabic`).toBe(true);
      expect(arabic.test(value[1]), `${id} ${field} (en) must not contain Arabic`).toBe(false);
    }
  });

  it("only the Marketing panel carries tile descriptions and its own variant", () => {
    for (const panel of SERVICE_PANELS) {
      const marketing = panel.id === "marketing";
      expect(panel.variant === "marketing").toBe(marketing);
      for (const tile of panel.tiles) {
        expect(Boolean(tile.note), `${panel.id} tile note`).toBe(marketing);
        if (tile.note) {
          // deliberate two-line descriptions so the line breaks never depend on the zoom level
          expect(tile.note[0].split("\n")).toHaveLength(2);
          expect(tile.note[1].split("\n")).toHaveLength(2);
        }
      }
    }
  });

  it("ships every image a panel needs", () => {
    const sources = [
      BRAND_LEAF_SRC,
      CTA_ROCKET_SRC,
      ...SERVICE_PANELS.flatMap((panel) => [
        sceneSrc(panel.id),
        ...([1, 2, 3, 4] as const).map((position) => iconSrc(panel.id, position)),
      ]),
    ];
    expect(sources).toHaveLength(2 + SERVICE_PANELS.length * 5);
    for (const source of sources) {
      expect(existsSync(join(root, "public", source)), source).toBe(true);
    }
  });

  it("links only to existing platform routes and never to funding", () => {
    const hrefs = SERVICE_PANELS.flatMap((panel) => [panel.cta.href, ...panel.tiles.map((tile) => tile.href)]);
    expect(hrefs).toHaveLength(SERVICE_PANELS.length * 5);
    for (const href of hrefs) {
      expect(href.startsWith("/") && !href.startsWith("//"), href).toBe(true);
      expect(/funding|تمويل/i.test(decodeURIComponent(href)), `${href} must not expose funding`).toBe(false);
      expect(resolvesToPage(new URL(href, "https://jenan.invalid").pathname), `${href} must resolve to a page`).toBe(true);
    }
    for (const { value } of texts) expect(/funding|تأهل للتمويل|أهلية التمويل/i.test(value.join(" "))).toBe(false);
  });

  it("keeps the Market quick filters as plain, supported query strings", () => {
    const market = SERVICE_PANELS.find((panel) => panel.id === "market")!;
    const queries = market.tiles.map((tile) => new URL(tile.href, "https://jenan.invalid"));
    expect(queries.every((url) => url.pathname === "/market/listings")).toBe(true);
    expect(queries.map((url) => [...url.searchParams.keys()].sort().join(","))).toEqual(["", "kind", "q", "q"]);
    expect(market.underline).toBe("gold");
  });
});

describe("splitHeadline", () => {
  it("marks the starred words as the accent", () => {
    expect(splitHeadline("من الفكرة إلى *مشروع أقوى*")).toEqual([
      { text: "من الفكرة إلى ", accent: false },
      { text: "مشروع أقوى", accent: true },
    ]);
    expect(splitHeadline("Hire smart or *find* your *chance*")).toEqual([
      { text: "Hire smart or ", accent: false },
      { text: "find", accent: true },
      { text: " your ", accent: false },
      { text: "chance", accent: true },
    ]);
  });

  it("leaves no markup characters in any headline and always accents something", () => {
    for (const panel of SERVICE_PANELS) {
      for (const markup of panel.headline) {
        expect(markup.split("*").length % 2, `${panel.id} headline markers must be balanced`).toBe(1);
        const parts = splitHeadline(markup);
        expect(parts.some((part) => part.accent), `${panel.id} headline needs an accent`).toBe(true);
        expect(parts.map((part) => part.text).join("")).toBe(markup.replaceAll("*", ""));
      }
    }
  });
});
