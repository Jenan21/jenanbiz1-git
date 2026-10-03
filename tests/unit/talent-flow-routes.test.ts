import { describe, expect, it } from "vitest";

import { TALENT_FLOW_ROUTES, resolveTalentFlow } from "@/lib/talent/talent-routes";

describe("Talent route manifest", () => {
  it("matches all 12 authoritative routes", () => {
    expect(TALENT_FLOW_ROUTES.map((definition) => definition.route)).toEqual([
      "/talent",
      "/talent/jobs",
      "/talent/job/sample",
      "/talent/apply/sample",
      "/talent/profile",
      "/talent/employer",
      "/talent/employer/post",
      "/talent/employer/applicants",
      "/talent/candidate/sample",
      "/talent/search",
      "/talent/matching",
      "/talent/reports",
    ]);
  });

  it("resolves only allowlisted Talent child paths", () => {
    expect(resolveTalentFlow(["job", "sample"])?.id).toBe("job-detail");
    expect(resolveTalentFlow(["employer", "applicants"])?.id).toBe("employer-applicants");
    expect(resolveTalentFlow(["guaranteed-job"])).toBeNull();
  });
});