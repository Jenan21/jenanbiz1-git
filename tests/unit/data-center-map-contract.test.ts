import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assessMapBinding, assessMapReferenceUse, buildMapReference, dataCenterFreshness, effectiveMapLicenseClass, MAP_BINDING_CONTRACT, MAP_REFERENCE_CONTRACT,
  mapBindingSchema, mapReferenceSchema, type DataCenterMapReference, type MapReferenceInput,
} from "@/services/data-center/map-contract";

const now = new Date("2026-10-20T12:00:00.000Z");
const day = 86_400_000;
const none = { coverageCountries: [], coverageRegions: [], bboxWest: null, bboxSouth: null, bboxEast: null, bboxNorth: null };
const digest = "a".repeat(64);
function input(over: { item?: Partial<MapReferenceInput["item"]>; version?: Partial<MapReferenceInput["version"]>; source?: Partial<MapReferenceInput["source"]>; quality?: MapReferenceInput["quality"] } = {}): MapReferenceInput {
  return {
    item: { id: "item-1", title: "Atlas layer", typeKey: "geojson", layer: "DATA", status: "PUBLISHED", publishedVersion: 2, ...over.item },
    version: { id: "version-2", number: 2, checksum: digest, createdAt: new Date("2026-10-01T08:00:00.000Z"), evidenceStatus: "ESTIMATED", origin: "HUMAN", attribution: null,
      sourcePublishedAt: new Date("2026-09-01T00:00:00.000Z"), expiresAt: null, effectiveFrom: null, effectiveTo: null, ...none, ...over.version },
    source: { id: "source-1", name: "Atlas", kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", sourceOrganization: "Atlas Authority", sourceUrl: "https://atlas.example.test", ownership: "THIRD_PARTY",
      license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", attribution: "© Atlas contributors", attributionRequired: true,
      allowRetrieval: true, allowExport: true, freshnessDays: 90, ...over.source },
    upstreamVersionIds: ["version-1"], quality: over.quality ?? null,
    confidence: { score: 41, policyVersion: "dc-confidence-v2-seven-factors", evaluatedAt: now.toISOString() }, publishedAt: new Date("2026-10-02T09:00:00.000Z"),
  };
}
const reference = (over: Parameters<typeof input>[0] = {}) => buildMapReference(input(over), now);
const binding = (ref: DataCenterMapReference, over: { exportsArtifact?: boolean; artifactSha256?: string } = {}) =>
  mapBindingSchema.parse({ contract: MAP_BINDING_CONTRACT, map: { releaseId: "release-7", layerKey: "atlas", exportsArtifact: false, ...over }, reference: ref });

describe("Data Center → Map reference contract", () => {
  it("maps one published version to every member the Map needs and validates the result", () => {
    const ref = reference({ version: { attribution: "© Atlas 2026", coverageCountries: ["AE", "SA"], coverageRegions: ["SA-01"], bboxWest: 34.5, bboxSouth: 16, bboxEast: 55.7, bboxNorth: 32.2 } });
    expect(mapReferenceSchema.parse(ref)).toEqual(ref);
    expect(ref).toMatchObject({
      contract: MAP_REFERENCE_CONTRACT, resolvedAt: now.toISOString(),
      dataset: { itemId: "item-1", title: "Atlas layer", typeKey: "geojson", layer: "DATA" },
      version: { versionId: "version-2", number: 2, checksum: { algorithm: "SHA-256", value: digest }, evidenceStatus: "ESTIMATED", upstreamVersionIds: ["version-1"] },
      source: { sourceId: "source-1", name: "Atlas", kind: "OFFICIAL", scope: "PLATFORM", organization: "Atlas Authority", url: "https://atlas.example.test" },
      ownership: { ownership: "THIRD_PARTY", owner: "Authority" },
      rights: { license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", allowRetrieval: true, allowExport: true, attribution: { text: "© Atlas 2026", required: true, level: "VERSION" } },
      coverage: { crs: "WGS84", countryCodes: ["AE", "SA"], regionCodes: ["SA-01"], boundingBox: { west: 34.5, south: 16, east: 55.7, north: 32.2 } },
      confidence: { score: 41, heuristic: true },
      freshness: { status: "FRESH", freshnessDays: 90, sourcePublishedAt: "2026-09-01T00:00:00.000Z" },
      publication: { status: "PUBLISHED", publishedVersion: 2, publishedAt: "2026-10-02T09:00:00.000Z" },
    });
  });
  it("keeps unknown things unknown: no coverage, no quality, no attribution level", () => {
    const ref = reference({ source: { attribution: null, attributionRequired: false, licenseClass: null } });
    expect(ref.coverage).toBeNull();
    expect(ref.quality).toEqual({ status: "UNAVAILABLE" });
    expect(ref.rights).toMatchObject({ licenseClass: null, attribution: { text: null, required: false, level: null } });
    expect(reference().rights.attribution).toMatchObject({ text: "© Atlas contributors", level: "SOURCE" });
  });
  it("carries a recorded quality assessment together with its method, version and date, and never a score for insufficient data", () => {
    const measured = reference({ quality: { status: "MEASURED", score: 0.82, method: "manual-review", methodVersion: "2026.10", measuredAt: new Date("2026-10-05T00:00:00.000Z"), explanation: "Sampled 200 rows" } });
    expect(measured.quality).toEqual({ status: "MEASURED", score: 0.82, method: "manual-review", methodVersion: "2026.10", measuredAt: "2026-10-05T00:00:00.000Z", explanation: "Sampled 200 rows" });
    const insufficient = reference({ quality: { status: "INSUFFICIENT_DATA", score: null, method: "manual-review", methodVersion: "2026.10", measuredAt: new Date("2026-10-06T00:00:00.000Z"), explanation: "No match" } });
    expect(insufficient.quality).toEqual({ status: "INSUFFICIENT_DATA", method: "manual-review", methodVersion: "2026.10", measuredAt: "2026-10-06T00:00:00.000Z", explanation: "No match" });
    expect(() => mapReferenceSchema.parse({ ...measured, quality: { status: "MEASURED", method: "m", methodVersion: "1", measuredAt: now.toISOString(), explanation: "e" } })).toThrow();
    expect(() => mapReferenceSchema.parse({ ...measured, quality: { ...measured.quality, status: "INSUFFICIENT_DATA", score: 0.5 } })).toThrow();
  });
  it("references only the published version of a retrievable, unarchived item", () => {
    const thrown = (run: () => unknown) => { try { run(); } catch (error) { return error; } return undefined; };
    for (const over of [{ item: { publishedVersion: 1 } }, { item: { publishedVersion: null } }, { item: { status: "ARCHIVED" } }, { source: { allowRetrieval: false } }])
      expect(thrown(() => reference(over)), JSON.stringify(over)).toMatchObject({ code: "PUBLISHED_VERSION_NOT_FOUND", status: 404 });
    expect(reference({ item: { status: "DRAFT" } }).publication.publishedVersion).toBe(2);
  });
  it("rejects inconsistent rights, invented members and malformed digests", () => {
    const ref = reference();
    const bad: Record<string, unknown>[] = [
      { rights: { ...ref.rights, licenseClass: "JENAN_OWNED" } },
      { rights: { ...ref.rights, licenseClass: "RESTRICTED" } },
      { rights: { ...ref.rights, attribution: { text: null, required: true, level: null } } },
      { ownership: { ...ref.ownership, ownership: "AI_GENERATED" } },
      { publication: { ...ref.publication, publishedVersion: 3 } },
      { version: { ...ref.version, checksum: { algorithm: "SHA-256", value: "ABC" } } },
      { version: { ...ref.version, checksum: { algorithm: "MD5", value: digest } } },
      { geometry: { type: "Polygon" } }, { jenanMap: { releaseId: "r" } }, { contract: "other" }, { resolvedAt: "yesterday" },
      { coverage: { crs: "EPSG:3857", countryCodes: [], regionCodes: [], boundingBox: null } },
    ];
    for (const patch of bad) expect(() => mapReferenceSchema.parse({ ...ref, ...patch }), JSON.stringify(patch).slice(0, 70)).toThrow();
    expect(mapReferenceSchema.parse({ ...ref, ownership: { ...ref.ownership, ownership: "PLATFORM_OWNED" }, rights: { ...ref.rights, licenseClass: "JENAN_OWNED" } }).rights.licenseClass).toBe("JENAN_OWNED");
  });
  it("maps rights onto the Map's classes without losing the declared fields and fails closed when undeclared", () => {
    const declared = reference();
    expect(effectiveMapLicenseClass(declared)).toEqual({ declared: "OPEN_LICENSE", effective: "OPEN_LICENSE", basis: "DECLARED" });
    const undeclared = reference({ source: { licenseClass: null } });
    expect(effectiveMapLicenseClass(undeclared)).toEqual({ declared: null, effective: "RESTRICTED", basis: "UNCLASSIFIED_FAIL_CLOSED" });
    expect(undeclared.rights.licenseClass).toBeNull();
    expect(undeclared.ownership.ownership).toBe("THIRD_PARTY");
    expect(undeclared.rights.license).toBe("ODbL-1.0");
  });
});

describe("Map use and snapshot assessment", () => {
  it("allows display with truthful warnings and exports only declared, exportable, non-restricted data", () => {
    const display = assessMapReferenceUse(reference(), "DISPLAY", now);
    expect(display.allowed).toBe(true);
    expect(display.findings.map((f) => f.code)).toEqual(["QUALITY_UNAVAILABLE"]);
    expect(assessMapReferenceUse(reference(), "EXPORT", now).allowed).toBe(true);
    const blocked = (over: Parameters<typeof input>[0]) => assessMapReferenceUse(reference(over), "EXPORT", now);
    expect(blocked({ source: { allowExport: false } }).findings).toContainEqual(expect.objectContaining({ code: "EXPORT_NOT_PERMITTED", blocking: true }));
    expect(blocked({ source: { licenseClass: null } }).findings).toContainEqual(expect.objectContaining({ code: "LICENSE_CLASS_UNDECLARED", blocking: true }));
    expect(blocked({ source: { licenseClass: "RESTRICTED", allowExport: false } }).findings.map((f) => f.code)).toEqual(expect.arrayContaining(["LICENSE_CLASS_RESTRICTED", "EXPORT_NOT_PERMITTED"]));
    expect(assessMapReferenceUse(reference({ source: { licenseClass: null, allowExport: false } }), "DISPLAY", now).allowed).toBe(true);
  });
  it("re-evaluates freshness from the stored dates when the snapshot is used later", () => {
    const ref = reference();
    expect(assessMapReferenceUse(ref, "DISPLAY", new Date(now.getTime() + 30 * day)).findings.map((f) => f.code)).not.toContain("DATA_STALE");
    expect(assessMapReferenceUse(ref, "DISPLAY", new Date(now.getTime() + 120 * day)).findings).toContainEqual(expect.objectContaining({ code: "DATA_STALE", blocking: false }));
    const expiring = reference({ version: { expiresAt: new Date(now.getTime() + 10 * day) } });
    expect(assessMapReferenceUse(expiring, "DISPLAY", now).allowed).toBe(true);
    expect(assessMapReferenceUse(expiring, "DISPLAY", new Date(now.getTime() + 11 * day))).toMatchObject({ allowed: false, findings: expect.arrayContaining([expect.objectContaining({ code: "DATA_EXPIRED", blocking: true })]) });
    expect(assessMapReferenceUse(reference({ version: { sourcePublishedAt: null } }), "DISPLAY", now).findings.map((f) => f.code)).toContain("FRESHNESS_UNKNOWN");
  });
  it("classifies freshness without treating undated data as fresh", () => {
    const base = { sourcePublishedAt: new Date(now.getTime() - 10 * day), freshnessDays: 90, expiresAt: null, effectiveTo: null };
    expect(dataCenterFreshness(base, now)).toBe("FRESH");
    expect(dataCenterFreshness({ ...base, sourcePublishedAt: new Date(now.getTime() - 91 * day) }, now)).toBe("STALE");
    expect(dataCenterFreshness({ ...base, sourcePublishedAt: null }, now)).toBe("UNKNOWN");
    expect(dataCenterFreshness({ ...base, expiresAt: now }, now)).toBe("EXPIRED");
    expect(dataCenterFreshness({ ...base, sourcePublishedAt: null, effectiveTo: new Date(now.getTime() - 1) }, now)).toBe("EXPIRED");
  });
  it("requires an exported map artifact to record its own SHA-256 digest", () => {
    const ref = reference();
    expect(() => binding(ref, { exportsArtifact: true })).toThrow();
    expect(binding(ref, { exportsArtifact: true, artifactSha256: "b".repeat(64) }).map.artifactSha256).toBe("b".repeat(64));
    expect(() => binding(ref, { artifactSha256: "XYZ" })).toThrow();
    expect(() => mapBindingSchema.parse({ contract: MAP_BINDING_CONTRACT, map: { releaseId: "r", layerKey: "l", exportsArtifact: false, tableName: "jenan_map.layer" }, reference: ref })).toThrow();
  });
  it("reports whether the Data Center still agrees with a stored snapshot", () => {
    const snapshot = reference();
    const exported = binding(snapshot, { exportsArtifact: true, artifactSha256: "b".repeat(64) });
    expect(assessMapBinding(exported, reference())).toEqual({ consistent: true, findings: [] });
    expect(assessMapBinding(exported, null)).toMatchObject({ consistent: false, findings: [{ code: "DATA_CENTER_VERSION_UNAVAILABLE", blocking: true }] });
    const codes = (current: DataCenterMapReference, target = exported) => assessMapBinding(target, current).findings.map((f) => `${f.code}:${f.blocking ? "block" : "warn"}`);
    expect(codes(reference({ version: { id: "version-9" } }))).toContain("VERSION_MISMATCH:block");
    expect(codes(reference({ version: { checksum: "c".repeat(64) } }))).toContain("CHECKSUM_MISMATCH:block");
    expect(codes(reference({ source: { allowExport: false } }))).toEqual(["EXPORT_NO_LONGER_PERMITTED:block"]);
    expect(codes(reference({ source: { licenseClass: "RESTRICTED", allowExport: false } }))).toEqual(expect.arrayContaining(["EXPORT_NO_LONGER_PERMITTED:block", "LICENSE_CLASS_CHANGED:block"]));
    expect(codes(reference({ source: { licenseClass: "LICENSED" } }))).toEqual(["LICENSE_CLASS_CHANGED:warn"]);
    expect(codes(reference({ source: { licenseClass: "RESTRICTED", allowExport: false } }), binding(snapshot))).toEqual(["LICENSE_CLASS_CHANGED:warn"]);
    expect(codes(reference({ source: { license: "CC-BY-4.0", usagePolicy: "Credit required", attribution: "© Atlas", ownership: "USER_OWNED" } }))).toEqual(
      expect.arrayContaining(["LICENSE_CHANGED:warn", "USAGE_POLICY_CHANGED:warn", "ATTRIBUTION_CHANGED:warn", "OWNERSHIP_CHANGED:warn"]));
  });
});

describe("Map boundary", () => {
  const root = process.cwd();
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");
  const mentionsMap = (source: string) => /jenan[-_]map/i.test(strip(source));
  it("never imports Map code or names a jenan_map object anywhere in the Data Center services", () => {
    const directory = join(root, "services", "data-center");
    const files = readdirSync(directory).filter((name) => name.endsWith(".ts"));
    expect(files).toEqual(expect.arrayContaining(["map-contract.ts", "map-resolver.ts"]));
    for (const file of files) expect(mentionsMap(readFileSync(join(directory, file), "utf8")), file).toBe(false);
  });
  it("keeps every Data Center model, enum and migration free of references to the jenan_map schema", () => {
    const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
    const blocks = schema.match(/^(model|enum) DataCenter\w+ \{[\s\S]*?^\}/gm) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(18);
    for (const block of blocks) expect(mentionsMap(block), block.split("\n")[0]).toBe(false);
    const migrations = join(root, "prisma", "migrations");
    const dataCenter = readdirSync(migrations).filter((name) => name.includes("data_center"));
    expect(dataCenter.length).toBeGreaterThanOrEqual(9);
    for (const name of dataCenter) expect(mentionsMap(readFileSync(join(migrations, name, "migration.sql"), "utf8")), name).toBe(false);
  });
});
