import { describe, expect, it } from "vitest";
import { canDownloadMapArtifact, canMapAction, isAuthorizedMapUrl, mapArtifactDownloadUrl, mapErrorMessage, readMapSnapshot, type AdminMapSnapshot } from "./snapshot";
import { displayDate } from "./display";

const emptySnapshot: AdminMapSnapshot = {
  runtime: { status: "maintenance", publishedReleaseId: null, revision: 0 },
  releases: [],
  audit: [],
  blockers: ["NO_PUBLISHED_RELEASE"],
};

describe("Jenan PRO Map admin safeguards", () => {
  it("accepts the backend snapshot but never treats unavailable fallback values as actual state", () => {
    expect(readMapSnapshot(emptySnapshot)).toEqual(emptySnapshot);
    expect(readMapSnapshot({ success: true, snapshot: emptySnapshot })).toEqual(emptySnapshot);
    expect(readMapSnapshot({ ...emptySnapshot, available: false })).toBeNull();
    expect(readMapSnapshot({ error: "MAP_UNAVAILABLE" })).toBeNull();
    expect(readMapSnapshot({ ...emptySnapshot, runtime: { ...emptySnapshot.runtime, revision: -1 } })).toBeNull();
  });

  it("disables actions unless the backend explicitly advertises implementation", () => {
    expect(canMapAction(null, "publish")).toBe(false);
    expect(canMapAction(emptySnapshot, "publish")).toBe(false);
    expect(canMapAction({ ...emptySnapshot, capabilities: ["create"] }, "publish")).toBe(false);
    expect(canMapAction({ ...emptySnapshot, capabilities: ["publish"] }, "publish")).toBe(true);
  });

  it("allows only same-origin admin-authorized file URLs", () => {
    expect(isAuthorizedMapUrl("/api/admin/jenan-map/artifacts/abc-123")).toBe(true);
    expect(isAuthorizedMapUrl("/api/admin/jenan-map/artifacts/abc-123?expires=1792242000000")).toBe(true);
    expect(isAuthorizedMapUrl("/api/admin/jenan-map/artifacts/abc-123?download=1")).toBe(true);
    expect(isAuthorizedMapUrl("/api/admin/jenan-map/export?releaseId=abc-123")).toBe(true);
    for (const url of [undefined, "https://example.com/file", "//example.com/file", "/api/jenan-map/artifacts/abc", "/public/file.json", "/api/admin/jenan-map/artifacts/../secret", "/api/admin/jenan-map/artifacts/a?redirect=https://example.com"]) {
      expect(isAuthorizedMapUrl(url)).toBe(false);
    }
  });

  it("requires explicit documented export permission before rendering an artifact download", () => {
    const artifact = { id: "a", releaseId: "r", kind: "pmtiles", filename: "map.pmtiles", mime: "application/vnd.pmtiles", sha256: "a".repeat(64), byteSize: "127", url: "/api/admin/jenan-map/artifacts/a" };
    expect(canDownloadMapArtifact(artifact)).toBe(false);
    expect(canDownloadMapArtifact({ ...artifact, exportAllowed: true })).toBe(false);
    expect(canDownloadMapArtifact({ ...artifact, exportAllowed: true, exportLicense: " " })).toBe(false);
    expect(canDownloadMapArtifact({ ...artifact, exportAllowed: true, exportLicense: "Fixture license" })).toBe(true);
    expect(canDownloadMapArtifact({ ...artifact, exportAllowed: true, exportLicense: "Fixture license", url: "https://example.com" })).toBe(false);
    expect(mapArtifactDownloadUrl(artifact)).toBeUndefined();
    expect(mapArtifactDownloadUrl({ ...artifact, exportAllowed: true, exportLicense: "Fixture license" })).toBe("/api/admin/jenan-map/artifacts/a?download=1");
  });

  it("does not render missing or invalid dates as current dates", () => {
    expect(displayDate(null)).toBe("غير متاح");
    expect(displayDate("invalid")).toBe("غير متاح");
    expect(displayDate("2026-10-17T12:00:00Z")).toContain("UTC");
  });

  it("explains database outages and concurrency without claiming success", () => {
    expect(mapErrorMessage("DATABASE_UNAVAILABLE", 503)).toContain("لا يمكن استنتاج");
    expect(mapErrorMessage("STALE_REVISION", 409)).toContain("يدوياً");
    expect(mapErrorMessage(undefined, 403)).toContain("صلاحية");
    expect(mapErrorMessage("STALE_PUBLISHED_POINTER", 409)).toContain("يدوياً");
    expect(mapErrorMessage("CONCURRENT_CHANGE_RETRY", 409)).toContain("يدوياً");
    expect(mapErrorMessage("RELEASE_NOT_READY", 409)).toContain("غير جاهز");
    expect(mapErrorMessage("REVIEW_REQUIRED", 409)).toContain("مراجعته");
    expect(mapErrorMessage("INVALID_TRANSITION", 409)).not.toContain("يدوياً");
  });
});
