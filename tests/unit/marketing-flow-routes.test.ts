import { describe, expect, it } from "vitest";

import { MARKETING_FLOW_ROUTES, resolveMarketingFlow } from "@/lib/marketing/marketing-routes";

describe("Marketing route manifest", () => {
  it("matches all nine authoritative routes", () => {
    expect(MARKETING_FLOW_ROUTES.map((definition) => definition.route)).toEqual([
      "/marketing", "/marketing/campaigns", "/marketing/campaign/new", "/marketing/campaign/sample",
      "/marketing/audience", "/marketing/channels", "/marketing/leads", "/marketing/analytics", "/marketing/report/sample",
    ]);
  });

  it("resolves only allowlisted Marketing child paths", () => {
    expect(resolveMarketingFlow(["campaign", "sample"])?.id).toBe("campaign-detail");
    expect(resolveMarketingFlow(["report", "sample"])?.id).toBe("report");
    expect(resolveMarketingFlow(["guaranteed-results"])).toBeNull();
  });
});