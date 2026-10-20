import { describe, expect, it } from "vitest";
import { canDownloadMapArtifact, canMapAction, formatBytes, isAuthorizedMapUrl, mapArtifactDownloadUrl, mapErrorMessage, overviewSummary, readMapSnapshot, type AdminMapSnapshot } from "./snapshot";
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

describe("overview summary shows only what the server measured", () => {
  const release = (over: Record<string, unknown>) => ({ id: "r1", version: "v1", status: "Published", source: "s", sourceDate: "2026-10-01T00:00:00.000Z", license: "ODbL-1.0", createdAt: "2026-10-02T00:00:00.000Z", reviewedAt: null, reviewedBy: null, reviewNotes: null, publishedAt: "2026-10-03T00:00:00.000Z", failure: null, ...over });
  const tiles = (over: Record<string, unknown>) => ({ id: "a1", releaseId: "r1", kind: "pmtiles", filename: "x.pmtiles", mime: "application/vnd.pmtiles", sha256: "a".repeat(64), byteSize: "1073741824", ...over });
  const live: AdminMapSnapshot = {
    runtime: { status: "enabled", publishedReleaseId: "r1", revision: 3 },
    releases: [release({}), release({ id: "r0", version: "v0", status: "Archived", createdAt: "2026-09-01T00:00:00.000Z" })],
    audit: [{ id: "1", actorId: "u", action: "publish", releaseId: "r1", createdAt: "2026-10-04T00:00:00.000Z" }, { id: "2", actorId: "u", action: "approve", releaseId: "r1", createdAt: "2026-10-03T12:00:00.000Z" }],
    blockers: [], artifacts: [tiles({}), tiles({ id: "a2", releaseId: "r0", byteSize: "5" })],
    facts: { postgis: { status: "available", version: "3.5.2" }, activeLayers: 6, datasets: 7, features: 55081 },
  };

  it("derives version, last update, last publish and the size of the published tiles", () => {
    expect(overviewSummary(live)).toMatchObject({ activeVersion: "v1", lastUpdate: "2026-10-02T00:00:00.000Z", lastPublish: "2026-10-04T00:00:00.000Z", tilesBytes: BigInt(1073741824), datasets: 7, activeLayers: 6, features: 55081 });
    expect(overviewSummary(live)?.postgis).toEqual({ status: "available", version: "3.5.2" });
  });
  it("reports nothing as known when there is no snapshot, no published release or no measurement", () => {
    expect(overviewSummary(null)).toBeNull();
    const bare = overviewSummary({ ...live, runtime: { ...live.runtime, publishedReleaseId: null }, facts: undefined });
    expect(bare).toMatchObject({ activeVersion: null, lastPublish: null, tilesBytes: null, postgis: null, datasets: null, activeLayers: null, features: null });
  });
  it("never turns a malformed size into a number", () => {
    expect(overviewSummary({ ...live, artifacts: [tiles({ byteSize: "12 MB" })] })?.tilesBytes).toBeNull();
  });
  it("formats stored file sizes in binary units and says unknown for null", () => {
    expect(formatBytes(null)).toBe("غير معروف");
    expect(formatBytes(BigInt(512))).toBe("512 بايت");
    expect(formatBytes(BigInt(1073741824))).toBe("1.0 ج.ب");
    expect(formatBytes(BigInt(115044034))).toBe("109.7 م.ب");
  });
});