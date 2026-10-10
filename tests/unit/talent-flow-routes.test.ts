import { describe, expect, it } from "vitest";

import { TALENT_FLOW_ROUTES, resolveTalentFlow } from "@/lib/talent/talent-routes";

describe("Talent route manifest", () => {
  it("matches all authoritative route surfaces", () => {
    expect(TALENT_FLOW_ROUTES.map((definition) => definition.route)).toEqual([
      "/talent",
      "/talent/jobs",
      "/talent/jobs/saved",
      "/talent/jobs/[jobId]",
      "/talent/jobs/[jobId]/apply",
      "/talent/applications",
      "/talent/applications/[applicationId]",
      "/talent/profile",
      "/talent/profile/cv",
      "/talent/interviews",
      "/talent/notifications",
      "/talent/messages",
      "/talent/companies/[organizationId]",
      "/talent/matching",
      "/talent/employer",
      "/talent/employer/post",
      "/talent/employer/applicants",
      "/talent/candidate/sample",
      "/talent/search",
      "/talent/reports",
    ]);
  });

  it("resolves only allowlisted Talent child paths", () => {
    expect(resolveTalentFlow(["job", "sample"])?.id).toBe("job-detail");
    expect(resolveTalentFlow(["jobs", "job-id"])?.id).toBe("job-detail");
    expect(resolveTalentFlow(["jobs", "job-id", "apply"])?.id).toBe("apply");
    expect(resolveTalentFlow(["applications", "application-id"])?.id).toBe("application-detail");
    expect(resolveTalentFlow(["companies", "organization-id"])?.id).toBe("company");
    expect(resolveTalentFlow(["employer", "applicants"])?.id).toBe("employer-applicants");
    expect(resolveTalentFlow(["guaranteed-job"])).toBeNull();
  });
});