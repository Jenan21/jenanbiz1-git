import { describe, expect, it } from "vitest";
import manifest from "../../design-references/Jenan-PRO/extracted/Jenan_PRO_COMPLETE_PLATFORM_UI_BLUEPRINT/Jenan_PRO_COMPLETE_PLATFORM_UI_BLUEPRINT/03_PAGE_SPECS/route_manifest.json";
import { academyFlowDefinitions, findAcademyFlow } from "@/lib/academy/user-academy-routes";

describe("academy route contract", () => {
  it("matches every academy child route in the authoritative blueprint", () => {
    const expected = manifest.map((item) => item.route).filter((route) => route.startsWith("/academy/")).sort();
    expect(academyFlowDefinitions.map((item) => item.route).sort()).toEqual(expected);
  });

  it("keeps routes unique and resolves course-backed flows", () => {
    expect(new Set(academyFlowDefinitions.map((item) => item.route)).size).toBe(academyFlowDefinitions.length);
    expect(findAcademyFlow("/academy/course/sample/quiz")?.source).toBe("course");
    expect(findAcademyFlow("/academy/not-real")).toBeUndefined();
  });
});