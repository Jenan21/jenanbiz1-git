import type { PlatformModuleDefinition, PlatformServiceDefinition } from "@/lib/platform/catalog";

export function resolveServiceHref(service: PlatformServiceDefinition) {
  return service.href;
}

export function resolveModuleHref(module: PlatformModuleDefinition) {
  return module.route;
}
