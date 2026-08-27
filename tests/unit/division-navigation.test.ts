import { describe, expect, it } from "vitest";

import { divisionDestinations } from "@/components/source/division-destinations";
import { builtInPlatformCatalog } from "@/lib/platform/catalog";
import { resolveModuleHref, resolveServiceHref } from "@/lib/platform/navigation";
import { resolveServiceTemplate } from "@/lib/platform/service-templates";

const expectedServiceCounts = {
  projects: 4,
  academy: 4,
  market: 2,
  talent: 2,
  software: 2,
  programs: 4,
  marketing: 3,
} as const;

describe("platform catalog navigation contract", () => {
  it("defines the seven approved main sections", () => {
    const sectionIds = builtInPlatformCatalog.modules
      .filter((module) => module.id !== "dashboard")
      .map((module) => module.id);

    expect(sectionIds).toEqual(Object.keys(expectedServiceCounts));
  });

  it("keeps the approved service count for every main section", () => {
    for (const [moduleId, count] of Object.entries(expectedServiceCounts)) {
      const catalogModule = builtInPlatformCatalog.modules.find(
        (item) => item.id === moduleId,
      );
      expect(catalogModule?.services, moduleId).toHaveLength(count);
      expect(divisionDestinations[`/${moduleId}`], moduleId).toHaveLength(
        count,
      );
    }
  });

  it("uses unique absolute routes and service ids", () => {
    const services = builtInPlatformCatalog.modules.flatMap(
      (module) => module.services,
    );
    const routes = services.map((service) => service.href);
    const ids = services.map((service) => service.id);

    expect(routes.every((href) => href.startsWith("/"))).toBe(true);
    expect(new Set(routes).size).toBe(routes.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reports the truthful preview state until an admin provider is connected", () => {
    expect(builtInPlatformCatalog.sourceState).toBe("preview-catalog");
  });

  it("assigns every service a safe registered template", () => {
    for (const service of builtInPlatformCatalog.modules.flatMap(
      (module) => module.services,
    )) {
      expect(resolveServiceTemplate(service.template)).toBe(service.template);
    }
  });

  it("selects the four project experiences from catalog data", () => {
    const projects = builtInPlatformCatalog.modules.find(
      (module) => module.id === "projects",
    );
    expect(projects?.services.map((service) => service.template)).toEqual([
      "projects-analysis",
      "projects-feasibility",
      "projects-evaluation",
      "projects-launch",
    ]);
  });

  it("keeps preview navigation catalog-driven and safely falls back to live routes", () => {
    const specialized = builtInPlatformCatalog.modules
      .flatMap((module) => module.services)
      .filter((service) => service.template !== "catalog-service");

    expect(specialized).toHaveLength(8);
    for (const service of specialized) {
      expect(service.previewHref).toMatch(/^\//);
      expect(resolveServiceHref(service, "preview")).toBe(service.previewHref);
      expect(resolveServiceHref(service, "live")).toBe(service.href);
    }

    const generic = builtInPlatformCatalog.modules
      .flatMap((module) => module.services)
      .find((service) => service.template === "catalog-service");
    expect(generic).toBeDefined();
    expect(resolveServiceHref(generic!, "preview")).toBe(generic!.href);
  });

  it("keeps module return routes catalog-driven in live and preview modes", () => {
    for (const moduleId of ["projects", "academy"] as const) {
      const catalogModule = builtInPlatformCatalog.modules.find(
        (item) => item.id === moduleId,
      );
      expect(catalogModule).toBeDefined();
      expect(resolveModuleHref(catalogModule!, "live")).toBe(`/${moduleId}`);
      expect(resolveModuleHref(catalogModule!, "preview")).toBe(
        catalogModule!.previewHref,
      );
    }
  });

  it("falls back safely for unknown future admin template values", () => {
    expect(resolveServiceTemplate("future-template")).toBe("catalog-service");
    expect(resolveServiceTemplate(undefined)).toBe("catalog-service");
  });
});
