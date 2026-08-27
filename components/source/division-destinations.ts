import { builtInPlatformCatalog } from "@/lib/platform/catalog";

export const divisionDestinations: Readonly<Record<string, readonly string[]>> =
  Object.fromEntries(
    builtInPlatformCatalog.modules.map((module) => [
      module.route,
      module.services.map((service) => service.href),
    ]),
  );

export const supportedDivisionModules = new Set(
  builtInPlatformCatalog.modules
    .filter((module) => module.id !== "dashboard")
    .map((module) => module.id),
);
