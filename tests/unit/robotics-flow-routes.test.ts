import { describe, expect, it } from "vitest";

import { ROBOTICS_FLOW_ROUTES, resolveRoboticsFlow } from "@/lib/robotics/robotics-routes";

describe("Robotics route manifest", () => {
  it("matches all five authoritative user routes", () => {
    expect(ROBOTICS_FLOW_ROUTES.map((definition) => definition.route)).toEqual([
      "/robotics", "/robotics/search", "/robotics/results", "/robotics/item/sample", "/robotics/recommendations",
    ]);
  });

  it("keeps administrative robot paths outside the user router", () => {
    expect(resolveRoboticsFlow(["item", "sample"])?.id).toBe("item");
    expect(resolveRoboticsFlow(["recommendations"])?.id).toBe("recommendations");
    expect(resolveRoboticsFlow(["factory"])).toBeNull();
    expect(resolveRoboticsFlow(["registry"])).toBeNull();
  });
});