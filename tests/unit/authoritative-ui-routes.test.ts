import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AUTHORITATIVE_UI_ROUTES } from "@/lib/platform/authoritative-ui-routes";

const catalogPath = join(
  process.cwd(),
  "design-references",
  "Jenan-PRO",
  "extracted",
  "Jenan_PRO_PAGE_BY_PAGE_UI_REFERENCES",
  "Jenan_PRO_PAGE_BY_PAGE_UI_REFERENCES",
  "PAGE_CATALOG.csv",
);

function readActiveCatalogRoutes() {
  return readFileSync(catalogPath, "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",")[2])
    .filter((path): path is string => Boolean(path) && !path.startsWith("/funding"));
}

describe("authoritative Jenan PRO UI routes", () => {
  it("matches the 152 active references with canonical Auth routes", () => {
    const catalogRoutes = readActiveCatalogRoutes();
    const canonicalCatalogRoutes = catalogRoutes.map((path) =>
      path === "/auth/login"
        ? "/login"
        : path === "/auth/register"
          ? "/register"
          : path,
    );
    const implementedRoutes = AUTHORITATIVE_UI_ROUTES.map((route) => route.path);

    expect(catalogRoutes).toHaveLength(152);
    expect(implementedRoutes).toHaveLength(152);
    expect(new Set(implementedRoutes).size).toBe(152);
    expect([...implementedRoutes].sort()).toEqual(
      [...canonicalCatalogRoutes].sort(),
    );
    expect(implementedRoutes).not.toContain("/auth/login");
    expect(implementedRoutes).not.toContain("/auth/register");
  });

  it("never includes the permanently removed Funding section", () => {
    expect(AUTHORITATIVE_UI_ROUTES.some((route) => route.path.startsWith("/funding"))).toBe(false);
  });
});