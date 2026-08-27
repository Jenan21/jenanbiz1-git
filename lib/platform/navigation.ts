import type { PlatformModuleDefinition, PlatformServiceDefinition } from "@/lib/platform/catalog";

export type PlatformNavigationMode = "live" | "preview";

export function resolveServiceHref(
  service: PlatformServiceDefinition,
  mode: PlatformNavigationMode = "live",
) {
  const candidate = mode === "preview" ? service.previewHref : service.href;
  return candidate?.startsWith("/") ? candidate : service.href;
}

export function resolveModuleHref(
  module: PlatformModuleDefinition,
  mode: PlatformNavigationMode = "live",
) {
  const candidate = mode === "preview" ? module.previewHref : module.route;
  return candidate?.startsWith("/") ? candidate : module.route;
}
