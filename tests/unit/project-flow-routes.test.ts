import { describe, expect, it } from "vitest";
import manifest from "../../design-references/Jenan-PRO/extracted/Jenan_PRO_COMPLETE_PLATFORM_UI_BLUEPRINT/Jenan_PRO_COMPLETE_PLATFORM_UI_BLUEPRINT/03_PAGE_SPECS/route_manifest.json";
import { findProjectFlow, projectFlowDefinitions } from "@/lib/projects/project-flow-routes";

describe("project flow route contract", () => {
  it("covers every blueprint route and the approved integrated evaluation flow", () => {
    const expected = manifest
      .map((item) => item.route)
      .filter((route) => route.startsWith("/projects/") && route !== "/projects/feasibility")
      .sort();
    const implemented = projectFlowDefinitions.map((item) => item.route);
    const integratedEvaluation = [
      "/projects/start/evaluation",
      "/projects/start/evaluation/new",
      "/projects/start/evaluation/recommendations",
      "/projects/start/evaluation/report",
      "/projects/start/evaluation/result",
      "/projects/start/evaluation/risks",
    ];
    expect(expected.every((route) => implemented.includes(route))).toBe(true);
    expect(integratedEvaluation.every((route) => implemented.includes(route))).toBe(true);
    expect(implemented).toHaveLength(expected.length + integratedEvaluation.length);
  });

  it("keeps routes unique and rejects unknown paths", () => {
    expect(new Set(projectFlowDefinitions.map((item) => item.route)).size).toBe(projectFlowDefinitions.length);
    expect(findProjectFlow("/projects/analysis/result")?.focus).toBe("assessment");
    expect(findProjectFlow("/projects/feasibility/pro/marketing")?.kind).toBe("wizard");
    expect(findProjectFlow("/projects/analysis/print")?.focus).toBe("report");
    expect(findProjectFlow("/projects/not-real")).toBeUndefined();
  });
});