import { describe, expect, it } from "vitest";

import { STUDIO_FLOW_ROUTES, resolveStudioFlow } from "@/lib/studio/studio-routes";

describe("studio route manifest", () => {
  it("matches the ten authoritative Tools routes", () => {
    expect(STUDIO_FLOW_ROUTES.map((route) => route.href)).toEqual([
      "/studio",
      "/studio/pdf",
      "/studio/pdf/editor",
      "/studio/docs",
      "/studio/sheets",
      "/studio/presentations",
      "/studio/logo",
      "/studio/letterhead",
      "/studio/cv",
      "/studio/history",
    ]);
  });

  it("resolves only allowlisted child paths", () => {
    expect(resolveStudioFlow(["pdf", "editor"])?.id).toBe("pdf-editor");
    expect(resolveStudioFlow(["history"])?.id).toBe("history");
    expect(resolveStudioFlow(["unsupported"])).toBeNull();
  });
});