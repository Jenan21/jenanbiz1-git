import { describe, expect, it } from "vitest";
import { isMapAdminSection, mapAdminSections } from "./sections";
import { adminNavItems } from "@/lib/admin/navigation";

describe("Jenan PRO Map admin section allowlist", () => {
  it("supports all nine isolated management sections", () => {
    expect(mapAdminSections).toHaveLength(9);
    for (const [section] of mapAdminSections) expect(isMapAdminSection(section)).toBe(true);
  });

  it("rejects unimplemented and inherited object keys", () => {
    for (const section of ["upload", "publish", "map-provider", "../settings", "constructor", "toString", ""]) {
      expect(isMapAdminSection(section)).toBe(false);
    }
  });

  it("adds one isolated entry without replacing the existing map-provider integration", () => {
    expect(adminNavItems.filter((item) => item.href === "/admin/jenan-map")).toHaveLength(1);
    expect(adminNavItems.filter((item) => item.href === "/admin/map-provider")).toHaveLength(1);
  });
});
