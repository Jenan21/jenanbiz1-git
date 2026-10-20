import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { MapError } from "@/services/jenan-map/contracts";
import { RESTORE_CONFIRMATION, restoredVersion, restoreSchema, rewriteReleaseBase } from "@/services/jenan-map/restore";
import { releaseAssetBase } from "@/services/jenan-map/validation";

const original = "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1";
const copy = "9f2d3c4e-0000-4000-8000-000000000042";

describe("restore: a restored release is a new, separately named candidate", () => {
  const valid = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
  it("builds a version that the release contract accepts and that differs from the source", () => {
    const version = restoredVersion("2026.10.17", original, new Date("2026-10-18T07:08:09Z"));
    expect(version).toBe("2026.10.17-restored-20261018070809-1c1b");
    expect(version).toMatch(valid);
    expect(version).not.toBe("2026.10.17");
  });
  it("cleans and bounds hostile or very long source versions", () => {
    for (const source of ["../../etc/passwd", "  spaced name  ", "x".repeat(200), "---", "", "عربي"]) {
      const version = restoredVersion(source, original, new Date("2026-10-18T07:08:09Z"));
      expect(version, source).toMatch(valid);
      expect(version.length).toBeLessThanOrEqual(80);
      expect(version).toContain("-restored-");
    }
  });
});

describe("restore: the style of the copy never points back at the original release", () => {
  const style = JSON.stringify({
    glyphs: `${releaseAssetBase(original)}/glyphs/{fontstack}/{range}.pbf`,
    sources: { saudi: { type: "vector", url: `pmtiles://${releaseAssetBase(original)}/pmtiles/saudi.pmtiles` } },
  });
  it("rewrites every asset URL to the new release", () => {
    const rewritten = rewriteReleaseBase(style, original, copy);
    expect(rewritten).toContain(`${releaseAssetBase(copy)}/glyphs/{fontstack}/{range}.pbf`);
    expect(rewritten).toContain(`pmtiles://${releaseAssetBase(copy)}/pmtiles/saudi.pmtiles`);
    expect(rewritten).not.toContain(original);
    expect(JSON.parse(rewritten).sources.saudi.type).toBe("vector");
  });
  it("refuses a style that names the original release anywhere else", () => {
    const sneaky = JSON.stringify({ metadata: { note: `see release ${original}` } });
    expect(() => rewriteReleaseBase(sneaky, original, copy)).toThrow(MapError);
    expect(() => rewriteReleaseBase(sneaky, original, copy)).toThrow("STYLE_REFERENCES_OTHER_RELEASE");
  });
});

describe("restore: the request needs an explicit confirmation", () => {
  it("accepts only the exact confirmation and no extra fields", () => {
    expect(restoreSchema.safeParse({ action: "restore", folder: "jenan-map-1", confirmation: RESTORE_CONFIRMATION }).success).toBe(true);
    for (const bad of [
      { action: "restore", folder: "jenan-map-1" }, { action: "restore", folder: "jenan-map-1", confirmation: "restore" },
      { action: "restore", folder: "", confirmation: RESTORE_CONFIRMATION }, { action: "restore", folder: "a", confirmation: RESTORE_CONFIRMATION, releaseId: original },
    ]) expect(restoreSchema.safeParse(bad).success).toBe(false);
  });
});
