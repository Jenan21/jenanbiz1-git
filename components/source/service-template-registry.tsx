import type { ComponentType } from "react";

import { AcademyStudiesCinematic } from "@/components/source/academy-studies-cinematic";
import { AcademyPathCinematic } from "@/components/source/academy-path-cinematic";
import type {
  PlatformModuleDefinition,
  PlatformServiceDefinition,
} from "@/lib/platform/catalog";
import {
  resolveServiceTemplate,
  type ServiceTemplateKey,
} from "@/lib/platform/service-templates";
import type { Locale } from "@/types/i18n";

export interface ServiceTemplateProps {
  locale: Locale;
  module: PlatformModuleDefinition;
  service: PlatformServiceDefinition;
  userId: string;
  userLabel: string;
}

const specializedServiceTemplates: Readonly<
  Partial<Record<ServiceTemplateKey, ComponentType<ServiceTemplateProps>>>
> = {
  "academy-studies": AcademyStudiesCinematic,
  "academy-seminars": AcademyPathCinematic,
  "academy-research": AcademyPathCinematic,
  "academy-courses": AcademyPathCinematic,
};

export function ServiceTemplateRenderer(props: ServiceTemplateProps) {
  const template = resolveServiceTemplate(props.service.template);
  if (template === "catalog-service") return null;
  const Renderer = specializedServiceTemplates[template];
  if (!Renderer) return null;
  return <Renderer {...props} />;
}

export function hasSpecializedServiceTemplate(
  service: PlatformServiceDefinition,
) {
  return Boolean(specializedServiceTemplates[resolveServiceTemplate(service.template)]);
}
