import { describe, expect, it } from "vitest";
import { adminNavItems } from "@/lib/admin/navigation";

describe("admin navigation contract", () => {
  it("keeps unique routes with bilingual labels and icon mappings", () => {
    const hrefs = adminNavItems.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const item of adminNavItems) {
      expect(item.label.ar.trim().length).toBeGreaterThan(1);
      expect(item.label.en.trim().length).toBeGreaterThan(1);
      expect(item.icon).toBeTruthy();
    }
  });
});
