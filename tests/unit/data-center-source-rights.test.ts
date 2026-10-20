import { describe, expect, it } from "vitest";
import { commandSchema, DEFAULT_USAGE_POLICY, resolveSourceOwnership, sourceSchema } from "@/services/data-center/contracts";

const base = { name: "Atlas", kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "ODbL-1.0" } as const;

describe("Data Center source rights contract", () => {
  it("keeps ownership, license text, declared license class and usage policy as separate fields", () => {
    const parsed = sourceSchema.parse({ ...base, ownership: "THIRD_PARTY", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required",
      attribution: "© OpenStreetMap contributors", attributionRequired: true, sourceUrl: "https://www.openstreetmap.org/copyright" });
    expect(parsed).toMatchObject({ ownership: "THIRD_PARTY", license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", attributionRequired: true });
  });
  it("derives only a conservative ownership when none is declared and never invents a license class", () => {
    const parsed = sourceSchema.parse(base);
    expect(parsed.ownership).toBeUndefined();
    expect(parsed.licenseClass).toBeUndefined();
    expect(parsed.attributionRequired).toBe(false);
    expect(resolveSourceOwnership(parsed)).toBe("THIRD_PARTY");
    expect(resolveSourceOwnership({ kind: "GENERATED" })).toBe("AI_GENERATED");
    expect(DEFAULT_USAGE_POLICY).toMatch(/redistribution requires explicit permission/);
  });
  it("ties AI_GENERATED ownership and GENERATED kind together in both directions", () => {
    expect(() => sourceSchema.parse({ ...base, ownership: "AI_GENERATED" })).toThrow();
    expect(() => sourceSchema.parse({ ...base, kind: "GENERATED", ownership: "THIRD_PARTY" })).toThrow();
    expect(sourceSchema.parse({ ...base, kind: "GENERATED" }).kind).toBe("GENERATED");
    expect(sourceSchema.parse({ ...base, kind: "GENERATED", ownership: "AI_GENERATED" }).ownership).toBe("AI_GENERATED");
  });
  it("requires attribution text when attribution is mandatory", () => {
    expect(() => sourceSchema.parse({ ...base, attributionRequired: true })).toThrow();
    expect(sourceSchema.parse({ ...base, attributionRequired: true, attribution: "Source: Authority" }).attribution).toBe("Source: Authority");
  });
  it("requires platform ownership for JENAN_OWNED and forbids export of RESTRICTED sources", () => {
    expect(() => sourceSchema.parse({ ...base, licenseClass: "JENAN_OWNED" })).toThrow();
    expect(() => sourceSchema.parse({ ...base, ownership: "USER_OWNED", licenseClass: "JENAN_OWNED" })).toThrow();
    expect(sourceSchema.parse({ ...base, ownership: "PLATFORM_OWNED", licenseClass: "JENAN_OWNED", allowExport: true }).licenseClass).toBe("JENAN_OWNED");
    expect(() => sourceSchema.parse({ ...base, licenseClass: "RESTRICTED", allowExport: true })).toThrow();
    expect(sourceSchema.parse({ ...base, licenseClass: "RESTRICTED" }).allowExport).toBe(false);
  });
  it("accepts only credential-free http(s) source URLs", () => {
    for (const sourceUrl of ["javascript:alert(1)", "ftp://example.test/file", "data:text/html,x", "https://user:secret@example.test/", "not a url"])
      expect(() => sourceSchema.parse({ ...base, sourceUrl })).toThrow();
    expect(sourceSchema.parse({ ...base, sourceUrl: "http://example.test/dataset" }).sourceUrl).toBe("http://example.test/dataset");
  });
  it("is enforced through the create-source command used by the HTTP boundary", () => {
    expect(commandSchema.parse({ ...base, action: "create-source", ownership: "PLATFORM_OWNED", licenseClass: "JENAN_OWNED" })).toMatchObject({ action: "create-source", licenseClass: "JENAN_OWNED" });
    expect(() => commandSchema.parse({ ...base, action: "create-source", licenseClass: "SUPER_OPEN" })).toThrow();
    expect(() => commandSchema.parse({ ...base, action: "create-source", licenseClass: "RESTRICTED", allowExport: true })).toThrow();
  });
});
