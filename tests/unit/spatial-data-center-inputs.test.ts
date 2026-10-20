import { describe, expect, it } from "vitest";
import { deriveInputGaps, engineInputSchema, findInputViolations } from "@/services/analysis-engines/shared";
import { buildDataCenterInput, dataCenterInputId } from "@/services/analysis-engines/spatial/data-center-inputs";
import { DC_SHA, DC_VERSION_ID, makeReference } from "./support/spatial-fake-dc-port";

const EVALUATED_AT = "2026-10-20T12:00:00.000Z";
const build = (reference = makeReference(), over: Partial<Parameters<typeof buildDataCenterInput>[0]> = {}) => buildDataCenterInput({ reference, roles: ["poi:hospital"], evaluatedAt: EVALUATED_AT, ...over });
const days = (count: number) => count * 86_400_000;
const at = (iso: string, delta: number) => new Date(Date.parse(iso) + delta).toISOString();

describe("a Data Center version as an engine input", () => {
  it("states exactly what the Data Center states: identity, checksum, source, ownership, license, usage policy, attribution, export, evidence, quality, freshness and coverage", () => {
    const input = build();
    expect(input).toEqual({
      id: `dc:${DC_VERSION_ID}`, roles: ["poi:hospital"], kind: "DATA_CENTER_VERSION", governance: "DC_PUBLISHED",
      ref: { system: "DATA_CENTER", id: DC_VERSION_ID, version: 3, label: "Riyadh hospitals" },
      checksum: { algorithm: "SHA-256", value: DC_SHA },
      source: { name: "Ministry of Health register", organization: "Ministry of Health", url: "https://data.example.test/hospitals" },
      ownership: "THIRD_PARTY", license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required",
      attribution: { text: "© Ministry of Health, 2026", required: true }, allowExport: true,
      completeness: "UNKNOWN", evidenceStatus: "ESTIMATED",
      quality: { status: "MEASURED", score: 0.82, method: "register-check", methodVersion: "2", measuredAt: "2026-09-01T00:00:00.000Z", explanation: "Compared with the official register" },
      freshness: { status: "FRESH", sourcePublishedAt: "2026-05-15T00:00:00.000Z", freshnessDays: 365, expiresAt: null },
      coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: { west: 46.0, south: 24.3, east: 47.3, north: 25.1 } },
      limitations: ["The Data Center does not record whether a dataset is complete, so completeness is treated as unknown."],
    });
    expect(engineInputSchema.parse(input)).toEqual(input);
    expect(dataCenterInputId(DC_VERSION_ID)).toBe(input.id);
  });

  it("invents nothing: an undeclared license class stays undeclared, export stays as the Data Center says, and unrecorded quality and coverage stay unavailable", () => {
    const input = build(makeReference({ rights: { licenseClass: null, allowExport: false, attribution: { text: null, required: false, level: null } }, quality: { status: "UNAVAILABLE" }, coverage: null }));
    expect(input).toMatchObject({ licenseClass: null, allowExport: false, attribution: { text: null, required: false }, quality: { status: "UNAVAILABLE" }, coverage: null, completeness: "UNKNOWN" });
    expect(findInputViolations(input)).toEqual([]);
    expect(deriveInputGaps(input).map((gap) => gap.code).sort()).toEqual(["COMPLETENESS_UNKNOWN", "COVERAGE_UNDECLARED", "EXPORT_NOT_PERMITTED", "LICENSE_CLASS_UNDECLARED", "QUALITY_UNAVAILABLE"]);
  });

  it("carries the quality the Data Center recorded, with its method and date, whatever the status", () => {
    const insufficient = build(makeReference({ quality: { status: "INSUFFICIENT_DATA", method: "register-check", methodVersion: "2", measuredAt: "2026-09-02T00:00:00.000Z", explanation: "Register unavailable" } }));
    expect(insufficient.quality).toEqual({ status: "INSUFFICIENT_DATA", method: "register-check", methodVersion: "2", measuredAt: "2026-09-02T00:00:00.000Z", explanation: "Register unavailable" });
    expect(insufficient.quality).not.toHaveProperty("score");
    expect(engineInputSchema.safeParse(insufficient).success).toBe(true);
  });

  it("keeps each right the Data Center declares, separately: ownership, license text, license class and usage policy are never merged or derived from one another", () => {
    const owned = build(makeReference({ ownership: { ownership: "PLATFORM_OWNED", owner: "Jenan PRO" }, rights: { licenseClass: "JENAN_OWNED", license: "Proprietary", usagePolicy: "Internal and published map use", allowExport: false } }));
    expect(owned).toMatchObject({ ownership: "PLATFORM_OWNED", licenseClass: "JENAN_OWNED", license: "Proprietary", usagePolicy: "Internal and published map use", allowExport: false });
    const generated = build(makeReference({ source: { kind: "GENERATED" }, ownership: { ownership: "AI_GENERATED", owner: "Jenan PRO" }, rights: { licenseClass: null } }));
    expect(generated).toMatchObject({ ownership: "AI_GENERATED", licenseClass: null });
    expect(engineInputSchema.safeParse(owned).success && engineInputSchema.safeParse(generated).success).toBe(true);
  });

  it("judges freshness at the run's instant, not at the moment the Data Center resolved the reference", () => {
    const reference = makeReference({ freshness: { status: "FRESH", freshnessDays: 100, sourcePublishedAt: "2026-05-15T00:00:00.000Z" } });
    expect(build(reference, { evaluatedAt: at("2026-05-15T00:00:00.000Z", days(100)) }).freshness.status).toBe("FRESH");
    expect(build(reference, { evaluatedAt: at("2026-05-15T00:00:00.000Z", days(101)) }).freshness.status).toBe("STALE");
    expect(build(reference, { evaluatedAt: at("2026-05-15T00:00:00.000Z", days(5000)) }).freshness).toMatchObject({ status: "STALE", freshnessDays: 100, sourcePublishedAt: "2026-05-15T00:00:00.000Z" });
  });

  it("is expired from the earlier of the expiry and the end of the effective period, and says when", () => {
    const reference = makeReference({ freshness: { expiresAt: "2026-12-01T00:00:00.000Z", effectiveTo: "2026-11-01T00:00:00.000Z" } });
    expect(build(reference, { evaluatedAt: "2026-10-31T23:59:59.000Z" }).freshness).toMatchObject({ status: "FRESH", expiresAt: "2026-11-01T00:00:00.000Z" });
    expect(build(reference, { evaluatedAt: "2026-11-01T00:00:00.000Z" }).freshness).toMatchObject({ status: "EXPIRED", expiresAt: "2026-11-01T00:00:00.000Z" });
    const expiryOnly = makeReference({ freshness: { expiresAt: "2026-11-15T00:00:00.000Z" } });
    expect(build(expiryOnly, { evaluatedAt: "2026-11-16T00:00:00.000Z" }).freshness).toMatchObject({ status: "EXPIRED", expiresAt: "2026-11-15T00:00:00.000Z" });
    expect(build(makeReference(), { evaluatedAt: EVALUATED_AT }).freshness.expiresAt).toBeNull();
  });

  it("does not call undated data fresh: no source date means unknown", () => {
    const input = build(makeReference({ freshness: { sourcePublishedAt: null } }));
    expect(input.freshness).toEqual({ status: "UNKNOWN", sourcePublishedAt: null, freshnessDays: 365, expiresAt: null });
    expect(findInputViolations(input)).toEqual([]);
  });

  it("passes the declared coverage through unchanged, and none when none was declared", () => {
    expect(build(makeReference({ coverage: { crs: "WGS84", countryCodes: ["SA", "AE"], regionCodes: [], boundingBox: null } })).coverage).toEqual({ crs: "WGS84", countryCodes: ["SA", "AE"], regionCodes: [], boundingBox: null });
    expect(build(makeReference({ coverage: null })).coverage).toBeNull();
  });

  it("lists its roles sorted and once, and says how a version chosen by type was chosen", () => {
    const input = build(makeReference(), { roles: ["poi:school", "poi:hospital", "poi:school"], selection: { policy: "dc-version-selection-v1", asOf: "2026-06-01T00:00:00.000Z", typeKey: "geojson" } });
    expect(input.roles).toEqual(["poi:hospital", "poi:school"]);
    expect(input.limitations).toContain("Selected by the policy dc-version-selection-v1 among the published datasets of type geojson, as of 2026-06-01T00:00:00.000Z.");
    expect(input.limitations).toEqual([...input.limitations].sort());
    expect(build().limitations.some((limitation) => limitation.startsWith("Selected by"))).toBe(false);
  });

  it("keeps long texts within what the engine contract accepts, and drops a URL it cannot carry", () => {
    const long = "x".repeat(4000);
    const input = build(makeReference({
      dataset: { title: long }, source: { name: long, organization: long, url: `https://example.test/${"a".repeat(2100)}` }, rights: { license: long, usagePolicy: long, attribution: { text: long, required: true, level: "VERSION" } },
      quality: { status: "MEASURED", score: 0.5, method: long, methodVersion: long, measuredAt: "2026-09-01T00:00:00.000Z", explanation: long },
    }));
    expect(input.ref.label.length).toBeLessThanOrEqual(500);
    expect(input.source.name.length).toBeLessThanOrEqual(500);
    expect(input.source.url).toBeNull();
    expect(input.license.length).toBeLessThanOrEqual(500);
    expect(input.quality).toMatchObject({ status: "MEASURED" });
    expect(engineInputSchema.safeParse(input).success).toBe(true);
  });

  it("never copies what the engine must not carry: no resolution time, no heuristic confidence score of the Data Center", () => {
    const text = JSON.stringify(build());
    expect(text).not.toContain("resolvedAt");
    expect(text).not.toContain("dc-confidence");
    expect(text).not.toContain("heuristic");
  });
});
