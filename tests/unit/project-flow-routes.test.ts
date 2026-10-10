import { describe, expect, it } from "vitest";
import manifest from "../../design-references/Jenan-PRO/extracted/Jenan_PRO_COMPLETE_PLATFORM_UI_BLUEPRINT/Jenan_PRO_COMPLETE_PLATFORM_UI_BLUEPRINT/03_PAGE_SPECS/route_manifest.json";
import { findProjectFlow, projectFlowDefinitions } from "@/lib/projects/project-flow-routes";

describe("project flow route contract", () => {
  it("matches every child route in the authoritative blueprint", () => {
    const expected = manifest
      .map((item) => item.route)
      .filter((route) => route.startsWith("/projects/") && route !== "/projects/feasibility")
      .sort();
    expect(projectFlowDefinitions.map((item) => item.route).sort()).toEqual(expected);
  });

  it("keeps routes unique and rejects unknown paths", () => {
    expect(new Set(projectFlowDefinitions.map((item) => item.route)).size).toBe(projectFlowDefinitions.length);
    expect(findProjectFlow("/projects/analysis/result")?.focus).toBe("assessment");
    expect(findProjectFlow("/projects/feasibility/pro/marketing")?.kind).toBe("wizard");
    expect(findProjectFlow("/projects/not-real")).toBeUndefined();
  });
});