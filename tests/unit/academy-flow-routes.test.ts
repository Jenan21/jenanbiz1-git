import { describe, expect, it } from "vitest";
import manifest from "../../design-references/Jenan-PRO/extracted/Jenan_PRO_COMPLETE_PLATFORM_UI_BLUEPRINT/Jenan_PRO_COMPLETE_PLATFORM_UI_BLUEPRINT/03_PAGE_SPECS/route_manifest.json";
import { academyFlowDefinitions, findAcademyFlow } from "@/lib/academy/user-academy-routes";

describe("academy route contract", () => {
  it("matches every academy child route in the authoritative blueprint", () => {
    const expected = manifest.map((item) => item.route).filter((route) => route.startsWith("/academy/")).sort();
    const actual = academyFlowDefinitions.map((item) => item.route);
    expect(actual).toEqual(expect.arrayContaining(expected));
    expect(actual).toEqual(expect.arrayContaining([
      "/academy/sections",
      "/academy/section/business",
      "/academy/journey",
      "/academy/assessments",
      "/academy/certificates",
      "/academy/downloads",
      "/academy/community",
      "/academy/search",
      "/academy/profile",
    ]));
  });

  it("keeps routes unique and resolves course-backed flows", () => {
    expect(new Set(academyFlowDefinitions.map((item) => item.route)).size).toBe(academyFlowDefinitions.length);
    expect(findAcademyFlow("/academy/course/sample/quiz")?.source).toBe("course");
    expect(findAcademyFlow("/academy/not-real")).toBeUndefined();
  });
});