import type { ComponentType } from "react";

import { AcademyStudiesCinematic } from "@/components/source/academy-studies-cinematic";
import { AcademyPathCinematic } from "@/components/source/academy-path-cinematic";
import { ProjectsAnalysisCinematic } from "@/components/source/projects-analysis-cinematic";
import { ProjectsCompletionCinematic } from "@/components/source/projects-completion-cinematic";
import { ProjectsFeasibilityCinematic } from "@/components/source/projects-feasibility-cinematic";
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
  userLabel: string;
}

type SpecializedTemplateKey = Exclude<ServiceTemplateKey, "catalog-service">;

function EvaluationTemplate(props: ServiceTemplateProps) {
  return <ProjectsCompletionCinematic {...props} mode="evaluation" />;
}

function LaunchTemplate(props: ServiceTemplateProps) {
  return <ProjectsCompletionCinematic {...props} mode="launch" />;
}

const specializedServiceTemplates: Readonly<
  Record<SpecializedTemplateKey, ComponentType<ServiceTemplateProps>>
> = {
  "academy-studies": AcademyStudiesCinematic,
  "academy-seminars": AcademyPathCinematic,
  "academy-research": AcademyPathCinematic,
  "academy-courses": AcademyPathCinematic,
  "projects-analysis": ProjectsAnalysisCinematic,
  "projects-feasibility": ProjectsFeasibilityCinematic,
  "projects-evaluation": EvaluationTemplate,
  "projects-launch": LaunchTemplate,
};

export function ServiceTemplateRenderer(props: ServiceTemplateProps) {
  const template = resolveServiceTemplate(props.service.template);
  if (template === "catalog-service") return null;
  const Renderer = specializedServiceTemplates[template];
  return <Renderer {...props} />;
}

export function hasSpecializedServiceTemplate(
  service: PlatformServiceDefinition,
) {
  return resolveServiceTemplate(service.template) !== "catalog-service";
}
