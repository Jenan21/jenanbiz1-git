export const serviceTemplateKeys = [
  "catalog-service",
  "academy-studies",
  "academy-seminars",
  "academy-research",
  "academy-courses",
  "projects-analysis",
  "projects-feasibility",
  "projects-evaluation",
  "projects-launch",
] as const;

export type ServiceTemplateKey = (typeof serviceTemplateKeys)[number];

const knownServiceTemplates = new Set<string>(serviceTemplateKeys);

export function resolveServiceTemplate(
  value: string | null | undefined,
): ServiceTemplateKey {
  return value && knownServiceTemplates.has(value)
    ? (value as ServiceTemplateKey)
    : "catalog-service";
}
