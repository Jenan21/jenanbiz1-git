import { describe, expect, it } from "vitest";
import {
  assessCompetitorCount, competitorDatasetSchema, prepareCompetitorData, type CompetitorDatasetRole, type CompetitorDataPort,
} from "@/services/analysis-engines/competitor-analysis";
import { competitorInstant, competitorRequest } from "./support/competitor-analysis-fixtures";
import { competitorDataset, competitorPortFixture, competitorReference, competitorVersionIds, selfRef } from "./support/competitor-data-fixtures";

const request = () => { const req = competitorRequest(); req.data.roles = {}; return req; };
const run = (fixture = competitorPortFixture(), req = request()) => prepareCompetitorData(fixture.port, req, competitorInstant);
function changeDataset(fixture: ReturnType<typeof competitorPortFixture>, role: CompetitorDatasetRole, mutate: (dataset: ReturnType<typeof competitorDataset>) => void) {
  const dataset = competitorDataset(role); mutate(dataset);
  fixture.versions.set(competitorVersionIds[role], { reference: competitorReference(role), content: JSON.stringify(dataset) });
}
describe("Competitor M2 exact governed sources and deterministic selection", () => {
  it("prepares four required roles from Data Center descriptors, with no store, calculations or fake data", async () => {
    const fixture = competitorPortFixture(); const result = await run(fixture);
    expect(result).toMatchObject({ status: "AVAILABLE", validationReason: null, work: { discoveries: 4, reads: 4 } });
    expect(result.evidence?.entities).toHaveLength(1); expect(result.matches[0]?.relationship).toBe("DIRECT");
    expect(result.sources.every((source) => source.reference && source.dataset && source.input?.checksum)).toBe(true);
    expect(result.rights.allowExport).toBe(false); expect(result.attribution[0]?.text).toBe("Synthetic fixture credit");
    expect(result.evidence?.permissions.every((permission) => permission.analysisUsage === "ALLOWED")).toBe(true);
  });
  it("pins the exact requested version and checksum, never a similar dataset", async () => {
    const fixture = competitorPortFixture(); const req = request(); req.data.roles["competitor.locations"] = [{ versionId: "locations-1", expectedChecksum: "a".repeat(64) }];
    expect((await run(fixture, req)).status).toBe("AVAILABLE");
    expect(fixture.discover).toHaveBeenCalledWith({ versionIds: ["locations-1"] });
    expect(fixture.read).toHaveBeenCalledWith({ versionId: "locations-1", expectedChecksum: "a".repeat(64) });
  });
  it("exact missing pins fail without a by-type fallback or version read", async () => {
    const fixture = competitorPortFixture(); const req = request(); req.data.roles["competitor.locations"] = [{ versionId: "missing" }];
    const result = await run(fixture, req);
    expect(result.status).toBe("NOT_AVAILABLE"); expect(result.evidence).toBeNull();
    expect(fixture.discover.mock.calls.filter(([query]) => query.typeKeys?.includes("competitor-locations"))).toHaveLength(0);
    expect(fixture.read.mock.calls.some(([query]) => query.versionId === "locations-1")).toBe(false);
  });
  it("includes explicit typeKey/asOf and yields deterministic source/input hashes under request permutations", async () => {
    const fixture = competitorPortFixture(); const req = request(); req.data.roles["competitor.locations"] = { typeKey: "competitor-locations", asOf: competitorInstant };
    const first = await run(fixture, req); req.analyses.reverse(); req.countingUnits.reverse();
    const second = await run(fixture, req);
    expect(second).toEqual(first);
    expect(fixture.discover).toHaveBeenCalledWith({ typeKeys: ["competitor-locations"], asOf: competitorInstant, limit: 100 });
  });
  it("refuses a wrong type even if the title says competitors", async () => {
    const fixture = competitorPortFixture(); fixture.versions.get("locations-1")!.reference.dataset.typeKey = "population";
    const req = request(); req.data.roles["competitor.locations"] = [{ versionId: "locations-1" }];
    const result = await run(fixture, req);
    expect(result.status).toBe("NOT_COMPUTABLE"); expect(fixture.read.mock.calls.some(([query]) => query.versionId === "locations-1")).toBe(false);
  });
  it("rejects an explicit wrong role/type selector before discovery for that role", async () => {
    const fixture = competitorPortFixture(); const req = request(); req.data.roles["competitor.locations"] = { typeKey: "competitor-entities" };
    expect((await run(fixture, req)).status).toBe("NOT_COMPUTABLE");
    expect(fixture.discover.mock.calls.filter(([query]) => query.typeKeys?.includes("competitor-locations"))).toHaveLength(0);
  });
  it.each(["wrong-pin", "reader-integrity", "swapped-reference", "swapped-integrity"] as const)("blocks %s without a second-choice fallback", async (kind) => {
    const fixture = competitorPortFixture(); const req = request();
    if (kind === "wrong-pin") req.data.roles["competitor.locations"] = [{ versionId: "locations-1", expectedChecksum: "b".repeat(64) }];
    else {
      const read = fixture.port.read;
      fixture.port.read = async (query) => {
        const result = await read(query);
        if (query.versionId !== "locations-1") return result;
        if (kind === "reader-integrity") return { status: "INTEGRITY_ERROR" };
        if (result.status === "AVAILABLE") {
          if (kind === "swapped-reference") result.reference.version.versionId = "some-other-version";
          else result.integrity.checksum = "b".repeat(64);
        }
        return result;
      };
    }
    const result = await run(fixture, req); expect(result.status).toBe("NOT_COMPUTABLE"); expect(result.evidence).toBeNull();
  });
  it("rejects stale discovery/read policy snapshots and truncated selection", async () => {
    const fixture = competitorPortFixture(); const original = fixture.port.discover;
    fixture.port.discover = async (query) => ({ ...await original(query), truncated: true });
    expect((await run(fixture)).status).toBe("NOT_COMPUTABLE"); expect(fixture.read).not.toHaveBeenCalled();
  });
  it("does not swallow backend failures into a misleading unavailable state", async () => {
    const fixture = competitorPortFixture(); fixture.port.discover = async () => { throw new Error("database unavailable"); };
    await expect(run(fixture)).rejects.toThrow("database unavailable");
  });
});
describe("Competitor M2 strict datasets, scope and provenance", () => {
  it.each(["invalid-json", "wrong-role", "wrong-source", "unknown-field", "wrong-record-version", "bad-method"] as const)("rejects %s", async (kind) => {
    const fixture = competitorPortFixture(); const entry = fixture.versions.get("locations-1")!;
    if (kind === "invalid-json") entry.content = "{";
    else {
      const data = JSON.parse(entry.content);
      if (kind === "wrong-role") data.role = "competitor.entities";
      if (kind === "wrong-source") data.sourceId = "impersonated-source";
      if (kind === "unknown-field") data.fakeStrength = 87;
      if (kind === "wrong-record-version") data.sourceRecords[0].inputId = "dc:other-version";
      if (kind === "bad-method") data.sourceRecords[0].method = null;
      entry.content = JSON.stringify(data);
    }
    const result = await run(fixture); expect(result.status).toBe("NOT_COMPUTABLE"); expect(result.evidence).toBeNull();
  });
  it.each(["geography", "category", "temporal", "entity-definition"] as const)("returns NO_COVERAGE for uncovered %s, not zero", async (kind) => {
    const fixture = competitorPortFixture();
    changeDataset(fixture, "competitor.locations", (dataset) => {
      if (kind === "geography") dataset.coverage.geographies[0]!.code = "other";
      if (kind === "category") dataset.coverage.activities[0]!.id = "other";
      if (kind === "temporal") dataset.coverage.validity.end = competitorInstant;
      if (kind === "entity-definition") dataset.coverage.entityDefinitions[0]!.version = "2";
    });
    const result = await run(fixture); expect(result.status).toBe("NO_COVERAGE"); expect(result.evidence).toBeNull(); expect(result.coverage).toBeNull();
  });
  it("keeps partial coverage explicit; valid subset is not an exact total", async () => {
    const fixture = competitorPortFixture();
    changeDataset(fixture, "competitor.locations", (dataset) => { if (dataset.role === "competitor.locations") { dataset.inventory.status = "PARTIAL"; dataset.coverage.completeness = "SAMPLE"; } });
    const result = await run(fixture); expect(result.status).toBe("AVAILABLE");
    expect(assessCompetitorCount(result.evidence, result.request, result.coverage, "COMPETITOR_LOCATIONS", competitorInstant)).toMatchObject({ status: "PARTIAL", value: null, observedSubset: 1 });
  });
  it("rejects metadata/body coverage contradictions", async () => {
    const fixture = competitorPortFixture(); fixture.versions.get("locations-1")!.reference.coverage!.countryCodes = ["US"];
    expect((await run(fixture)).status).toBe("NOT_COMPUTABLE");
  });
  it("requires the versioned dictionary before category semantics can support matching", async () => {
    const fixture = competitorPortFixture();
    changeDataset(fixture, "competitor.dimensions", (dataset) => { if (dataset.role === "competitor.dimensions") dataset.rows = dataset.rows.filter((row) => row.kind !== "ACTIVITY"); });
    expect(await run(fixture)).toMatchObject({ status: "NOT_COMPUTABLE", evidence: null });
  });
  it("never classifies broad category presence as a direct competitor", async () => {
    const fixture = competitorPortFixture();
    changeDataset(fixture, "competitor.locations", (dataset) => { if (dataset.role === "competitor.locations") dataset.rows[0]!.activitySpecificity = "BROAD"; });
    const result = await run(fixture); expect(result.status).toBe("AVAILABLE"); expect(result.matches[0]?.relationship).toBe("UNKNOWN");
  });
  it("enforces direct/indirect criterion semantics, not merely the relationship label", async () => {
    const fixture = competitorPortFixture();
    changeDataset(fixture, "competitor.matching-rules", (dataset) => { if (dataset.role === "competitor.matching-rules") dataset.rows[0]!.relationship = "INDIRECT"; });
    expect((await run(fixture)).status).toBe("NOT_COMPUTABLE");
    changeDataset(fixture, "competitor.matching-rules", (dataset) => { if (dataset.role === "competitor.matching-rules") { dataset.rows[0]!.relationship = "INDIRECT"; dataset.rows[0]!.criterion = "DOCUMENTED_SUBSTITUTION"; } });
    expect((await run(fixture)).matches[0]?.relationship).toBe("INDIRECT");
  });
  it("retains complete source/version/hash/publication/ownership/license/usage/quality metadata", async () => {
    const result = await run();
    const source = result.sources.find((source) => source.role === "competitor.locations")!;
    expect(source.reference).toEqual(competitorReference("competitor.locations"));
    expect(source.input).toMatchObject({ id: "dc:locations-1", checksum: { value: "a".repeat(64) }, ownership: "THIRD_PARTY",
      license: "ODbL-1.0", usagePolicy: "Credit required", quality: { status: "MEASURED", score: 1 } });
    expect(result.evidence?.sourceRecords.every((record) => record.inputId.startsWith("dc:"))).toBe(true);
  });
  it("blocks withdrawn, expired and estimated source evidence before using content", async () => {
    for (const change of ["expired", "estimated", "usage"] as const) {
      const fixture = competitorPortFixture(); const reference = fixture.versions.get("locations-1")!.reference;
      if (change === "expired") reference.freshness.expiresAt = competitorInstant;
      if (change === "estimated") reference.version.evidenceStatus = "ESTIMATED";
      if (change === "usage") reference.rights.usagePolicy = " ";
      expect((await run(fixture)).status).toBe("NOT_COMPUTABLE");
    }
  });
});
describe("Competitor M2 identity and no implicit branch/business conversion", () => {
  it("validates exact source bindings then retains 1 entity and 15 locations", async () => {
    const result = await run(competitorPortFixture(15));
    expect(result.status).toBe("AVAILABLE");
    expect(assessCompetitorCount(result.evidence, result.request, result.coverage, "UNIQUE_COMPETITOR_ENTITIES", competitorInstant).value).toBe(1);
    expect(assessCompetitorCount(result.evidence, result.request, result.coverage, "COMPETITOR_LOCATIONS", competitorInstant).value).toBe(15);
  });
  it("unresolved entity identity blocks unique-business counting, not established locations", async () => {
    const fixture = competitorPortFixture();
    changeDataset(fixture, "competitor.locations", (dataset) => {
      if (dataset.role === "competitor.locations") { dataset.rows[0]!.competitorEntityId = null; dataset.rows[0]!.entityLinkState = "AMBIGUOUS"; dataset.rows[0]!.entityLinkEvidence = []; }
    });
    const result = await run(fixture);
    expect(assessCompetitorCount(result.evidence, result.request, result.coverage, "UNIQUE_COMPETITOR_ENTITIES", competitorInstant)).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
    expect(assessCompetitorCount(result.evidence, result.request, result.coverage, "COMPETITOR_LOCATIONS", competitorInstant).value).toBe(1);
  });
  it("rejects source-record impersonation, conflicting canonical rows and dangling entity ids", async () => {
    for (const kind of ["record", "conflict", "entity"] as const) {
      const fixture = competitorPortFixture();
      changeDataset(fixture, "competitor.locations", (dataset) => {
        if (dataset.role !== "competitor.locations") return;
        if (kind === "record") dataset.rows[0]!.evidence = [selfRef("nonexistent")];
        if (kind === "conflict") dataset.rows.push({ ...dataset.rows[0]!, branchId: "contradictory" });
        if (kind === "entity") dataset.rows[0]!.competitorEntityId = "entity:missing";
      });
      expect(await run(fixture)).toMatchObject({ status: "NOT_COMPUTABLE", evidence: null });
    }
  });
  it("does not silently combine independent location inventories into one total", async () => {
    const fixture = competitorPortFixture(); fixture.versions.set("locations-2", { reference: competitorReference("competitor.locations", "locations-2"), content: JSON.stringify(competitorDataset("competitor.locations")) });
    const req = request(); req.data.roles["competitor.locations"] = [{ versionId: "locations-1" }, { versionId: "locations-2" }];
    expect(await run(fixture, req)).toMatchObject({ status: "NOT_COMPUTABLE", evidence: null, validationReason: "MULTIPLE_INVENTORY_UNIVERSES_REQUIRE_EXPLICIT_PARTITION_POLICY" });
  });
  it("validates optional attributes against selected entity/location/source references without calculating them", async () => {
    const fixture = competitorPortFixture(); const req = request(); req.data.roles["competitor.attributes"] = [{ versionId: "attributes-1" }];
    fixture.versions.set("attributes-1", { reference: competitorReference("competitor.attributes"), content: JSON.stringify(competitorDataset("competitor.attributes")) });
    expect((await run(fixture, req)).status).toBe("AVAILABLE");
    changeDataset(fixture, "competitor.attributes", (dataset) => { if (dataset.role === "competitor.attributes") dataset.rows[0]!.subjectId = "location:missing"; });
    expect((await run(fixture, req)).status).toBe("NOT_COMPUTABLE");
  });
  it("validates dataset row limits and refuses missing source methodology", () => {
    const data = competitorDataset("competitor.locations", 1_000);
    expect(competitorDatasetSchema.safeParse(data).success).toBe(false);
    expect(competitorDatasetSchema.safeParse({ ...competitorDataset("competitor.entities"), sourceRecords: [] }).success).toBe(false);
  });
  it.each(["duplicate-original", "future-record", "future-row"] as const)("rejects %s instead of manufacturing valid identity evidence", async (kind) => {
    const fixture = competitorPortFixture();
    changeDataset(fixture, "competitor.locations", (dataset) => {
      if (kind === "duplicate-original") dataset.sourceRecords.push(structuredClone(dataset.sourceRecords[0]!));
      if (kind === "future-record") dataset.sourceRecords[0]!.validity.start = "2026-10-23T00:00:00.000Z";
      if (kind === "future-row" && dataset.role === "competitor.locations") dataset.rows[0]!.validity.start = "2026-10-23T00:00:00.000Z";
    });
    expect(await run(fixture)).toMatchObject({ status: "NOT_COMPUTABLE", evidence: null });
  });
  it.each(["expired-attribute", "foreign-scope", "missing-evidence"] as const)("blocks optional attribute %s", async (kind) => {
    const fixture = competitorPortFixture(); const req = request(); req.data.roles["competitor.attributes"] = [{ versionId: "attributes-1" }];
    changeDataset(fixture, "competitor.attributes", (dataset) => {
      if (dataset.role !== "competitor.attributes") return;
      if (kind === "expired-attribute") dataset.rows[0]!.validity.end = competitorInstant;
      if (kind === "foreign-scope") dataset.rows[0]!.scope.activity.id = "different-activity";
      if (kind === "missing-evidence") dataset.rows[0]!.evidence = [selfRef("missing")];
    });
    expect(await run(fixture, req)).toMatchObject({ status: "NOT_COMPUTABLE", evidence: null });
  });
  it.each(["RESOLVED", "AMBIGUOUS", "CONFLICTED", "contradictory", "expired", "stale-record"] as const)("checks explicit cross-source link %s without merging speculatively", async (kind) => {
    const fixture = competitorPortFixture(); const req = request(); req.data.roles["competitor.identity-links"] = [{ versionId: "links-1" }];
    changeDataset(fixture, "competitor.identity-links", (dataset) => {
      if (dataset.role !== "competitor.identity-links") return;
      const uncertain = kind === "AMBIGUOUS" || kind === "CONFLICTED";
      dataset.rows.push({
        contract: "jenan.competitor-analysis.identity-link/v1", id: "explicit-link", kind: "LOCATION_OF_ENTITY",
        leftRecord: { ...selfRef("branch:0"), inputId: "dc:locations-1" },
        rightRecord: { ...selfRef("entity:chain"), inputId: "dc:entities-1" },
        canonicalId: uncertain ? null : "entity:chain", certainty: uncertain ? kind : "RESOLVED",
        reason: "Synthetic explicit branch owner link", evidence: [selfRef("branch:0")], limitations: [],
        validity: { start: "2026-10-01T00:00:00.000Z", end: kind === "expired" ? competitorInstant : null },
      });
      if (kind === "contradictory") dataset.rows[0]!.kind = "SAME_ENTITY";
    });
    if (kind === "stale-record") changeDataset(fixture, "competitor.entities", (dataset) => {
      dataset.sourceRecords.find((record) => record.sourceRecordId === "entity:chain")!.validity.end = competitorInstant;
    });
    const result = await run(fixture, req);
    expect(result.status).toBe(kind === "RESOLVED" ? "AVAILABLE" : "NOT_COMPUTABLE");
    if (kind === "RESOLVED") expect(result.evidence?.entities).toHaveLength(1);
    else expect(result.evidence).toBeNull();
  });
  it("rejects oversized content at the read boundary before JSON parsing", async () => {
    const fixture = competitorPortFixture(); fixture.versions.get("locations-1")!.content = " ".repeat(200_001);
    expect(await run(fixture)).toMatchObject({ status: "NOT_COMPUTABLE", evidence: null });
  });
  it("does not retry another candidate after the chosen version has malformed content", async () => {
    const fixture = competitorPortFixture(); fixture.versions.get("locations-1")!.content = "{";
    fixture.versions.set("locations-2", { reference: competitorReference("competitor.locations", "locations-2"), content: JSON.stringify(competitorDataset("competitor.locations")) });
    expect(await run(fixture)).toMatchObject({ status: "NOT_COMPUTABLE", evidence: null });
    expect(fixture.read.mock.calls.some(([query]) => query.versionId === "locations-2")).toBe(false);
  });
  it("checks implicit required-role budget before performing any I/O", async () => {
    const fixture = competitorPortFixture(); const req = request();
    req.data.roles["competitor.locations"] = Array.from({ length: 32 }, (_, i) => ({ versionId: `v:${i}` }));
    await expect(run(fixture, req)).rejects.toThrow();
    expect(fixture.discover).not.toHaveBeenCalled(); expect(fixture.read).not.toHaveBeenCalled();
  });
  it("uses only the supplied port, not global network or storage", async () => {
    const fixture = competitorPortFixture();
    const port: CompetitorDataPort = { discover: fixture.discover, read: fixture.read };
    await expect(prepareCompetitorData(port, request(), competitorInstant)).resolves.toMatchObject({ status: "AVAILABLE" });
    expect(fixture.discover).toHaveBeenCalledTimes(4); expect(fixture.read).toHaveBeenCalledTimes(4);
  });
});
