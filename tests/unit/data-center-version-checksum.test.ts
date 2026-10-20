import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeDataCenterVersionChecksum, dataCenterVersionChecksumMatches, type VersionChecksumParts } from "@/services/data-center/version-checksum";

const parts = (over: Partial<VersionChecksumParts> = {}): VersionChecksumParts => ({
  title: "Riyadh hospitals", content: "{\"type\":\"FeatureCollection\",\"features\":[]}", evidenceStatus: "ESTIMATED", origin: "HUMAN",
  provenance: [{ label: "Ministry register", reference: "https://example.test/register", kind: "SOURCE" }],
  specialties: [], missionContexts: [], requiredPermission: null,
  sourcePublishedAt: new Date("2026-03-01T00:00:00.000Z"), expiresAt: null, effectiveFrom: null, effectiveTo: null,
  attribution: null, coverageCountries: [], coverageRegions: [], bboxWest: null, bboxSouth: null, bboxEast: null, bboxNorth: null, upstreamVersionIds: [], ...over,
});
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("the checksum the Data Center stores with a version, recomputed from its stored columns", () => {
  it("is the SHA-256 of the canonical JSON the Data Center hashes: the base members in their fixed order, nothing else", () => {
    const expected = sha(JSON.stringify({
      title: "Riyadh hospitals", content: "{\"type\":\"FeatureCollection\",\"features\":[]}", evidenceStatus: "ESTIMATED", origin: "HUMAN",
      provenance: [{ label: "Ministry register", reference: "https://example.test/register", kind: "SOURCE" }],
      specialties: [], missionContexts: [], requiredPermission: null,
      sourcePublishedAt: "2026-03-01T00:00:00.000Z", expiresAt: null, effectiveFrom: null, effectiveTo: null,
    }));
    expect(computeDataCenterVersionChecksum(parts())).toBe(expected);
    expect(dataCenterVersionChecksumMatches(parts(), expected)).toBe(true);
  });

  it("adds attribution, coverage and lineage to the hash only when they are present, so older versions keep their checksum", () => {
    const base = computeDataCenterVersionChecksum(parts());
    expect(computeDataCenterVersionChecksum(parts({ attribution: null, coverageCountries: [], upstreamVersionIds: [] }))).toBe(base);
    const withAttribution = sha(JSON.stringify({
      title: "Riyadh hospitals", content: "{\"type\":\"FeatureCollection\",\"features\":[]}", evidenceStatus: "ESTIMATED", origin: "HUMAN",
      provenance: [{ label: "Ministry register", reference: "https://example.test/register", kind: "SOURCE" }],
      specialties: [], missionContexts: [], requiredPermission: null, sourcePublishedAt: "2026-03-01T00:00:00.000Z", expiresAt: null, effectiveFrom: null, effectiveTo: null,
      attribution: "© Ministry of Health",
    }));
    expect(computeDataCenterVersionChecksum(parts({ attribution: "© Ministry of Health" }))).toBe(withAttribution);
    expect(withAttribution).not.toBe(base);
  });

  it("hashes the coverage as the contract writes it: sorted codes and a west, south, east, north box, or null when there is no box", () => {
    const covered = parts({ coverageCountries: ["SA", "AE"], coverageRegions: ["SA-02", "SA-01"], bboxWest: 34.5, bboxSouth: 16, bboxEast: 55.7, bboxNorth: 32.2 });
    const expected = sha(JSON.stringify({
      title: "Riyadh hospitals", content: "{\"type\":\"FeatureCollection\",\"features\":[]}", evidenceStatus: "ESTIMATED", origin: "HUMAN",
      provenance: [{ label: "Ministry register", reference: "https://example.test/register", kind: "SOURCE" }],
      specialties: [], missionContexts: [], requiredPermission: null, sourcePublishedAt: "2026-03-01T00:00:00.000Z", expiresAt: null, effectiveFrom: null, effectiveTo: null,
      coverage: { countryCodes: ["AE", "SA"], regionCodes: ["SA-01", "SA-02"], boundingBox: { west: 34.5, south: 16, east: 55.7, north: 32.2 } },
    }));
    expect(computeDataCenterVersionChecksum(covered)).toBe(expected);
    const noBox = sha(JSON.stringify({
      title: "Riyadh hospitals", content: "{\"type\":\"FeatureCollection\",\"features\":[]}", evidenceStatus: "ESTIMATED", origin: "HUMAN",
      provenance: [{ label: "Ministry register", reference: "https://example.test/register", kind: "SOURCE" }],
      specialties: [], missionContexts: [], requiredPermission: null, sourcePublishedAt: "2026-03-01T00:00:00.000Z", expiresAt: null, effectiveFrom: null, effectiveTo: null,
      coverage: { countryCodes: ["SA"], regionCodes: [], boundingBox: null },
    }));
    expect(computeDataCenterVersionChecksum(parts({ coverageCountries: ["SA"] }))).toBe(noBox);
  });

  it("does not depend on the order codes or upstream versions are listed in, or on repeated upstream versions", () => {
    const first = computeDataCenterVersionChecksum(parts({ coverageCountries: ["SA", "AE"], upstreamVersionIds: ["b", "a"] }));
    expect(computeDataCenterVersionChecksum(parts({ coverageCountries: ["AE", "SA"], upstreamVersionIds: ["a", "b", "a"] }))).toBe(first);
    expect(computeDataCenterVersionChecksum(parts({ upstreamVersionIds: ["a", "b"] }))).not.toBe(computeDataCenterVersionChecksum(parts()));
  });

  it("reads provenance as the contract wrote it even though the database returns its keys in another order", () => {
    const asStored = [{ kind: "SOURCE", label: "Ministry register", reference: "https://example.test/register" }];
    expect(computeDataCenterVersionChecksum(parts({ provenance: asStored }))).toBe(computeDataCenterVersionChecksum(parts()));
    // Entries that are not well formed are not repaired: they simply do not match.
    expect(computeDataCenterVersionChecksum(parts({ provenance: [{ kind: "SOURCE", label: "x" }] }))).not.toBe(computeDataCenterVersionChecksum(parts({ provenance: [{ label: "x", reference: "y", kind: "SOURCE" }] })));
    expect(computeDataCenterVersionChecksum(parts({ provenance: "not a list" }))).not.toBe(computeDataCenterVersionChecksum(parts()));
  });

  it.each<[string, Partial<VersionChecksumParts>]>([
    ["the title", { title: "Riyadh clinics" }], ["the content", { content: "{}" }], ["the evidence status", { evidenceStatus: "VERIFIED" }], ["the origin", { origin: "IMPORT" }],
    ["the provenance", { provenance: [] }], ["the specialties", { specialties: ["health"] }], ["the mission contexts", { missionContexts: ["site-study"] }],
    ["the required permission", { requiredPermission: "data-center.read" }], ["the source date", { sourcePublishedAt: new Date("2026-03-02T00:00:00.000Z") }],
    ["the expiry", { expiresAt: new Date("2027-01-01T00:00:00.000Z") }], ["the start of the effective period", { effectiveFrom: new Date("2026-04-01T00:00:00.000Z") }],
    ["the end of the effective period", { effectiveTo: new Date("2027-01-01T00:00:00.000Z") }], ["the attribution", { attribution: "© x" }],
    ["a country", { coverageCountries: ["SA"] }], ["a region", { coverageCountries: ["SA"], coverageRegions: ["SA-01"] }],
    ["the box", { coverageCountries: ["SA"], bboxWest: 1, bboxSouth: 2, bboxEast: 3, bboxNorth: 4 }], ["the lineage", { upstreamVersionIds: ["v1"] }],
  ])("changes when %s changes, so a stored change cannot go unnoticed", (_name, change) => {
    const original = computeDataCenterVersionChecksum(parts());
    expect(computeDataCenterVersionChecksum(parts(change))).not.toBe(original);
    expect(dataCenterVersionChecksumMatches(parts(change), original)).toBe(false);
  });

  it("is a lower-case hexadecimal SHA-256 and compares exactly", () => {
    const value = computeDataCenterVersionChecksum(parts());
    expect(value).toMatch(/^[a-f0-9]{64}$/);
    expect(dataCenterVersionChecksumMatches(parts(), value.toUpperCase())).toBe(false);
    expect(dataCenterVersionChecksumMatches(parts(), "")).toBe(false);
  });
});
