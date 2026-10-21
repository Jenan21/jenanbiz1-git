import { describe, expect, it } from "vitest";
import {
  assessCompetitorCount, classifyCompetitorLocation, classifyCompetitorLocations, competitorEntitySchema, competitorIdentityLinkSchema,
  competitorLocationSchema, competitorMatchSchema, competitorRequestSchema, describeCompetitorIdentity,
  normalizeCompetitorEvidence, normalizeCompetitorRequest,
} from "@/services/analysis-engines/competitor-analysis";
import { canonicalHash, EngineError } from "@/services/analysis-engines/shared";
import { competitorCoverage, competitorEvidence, competitorInstant, competitorRef, competitorRequest, competitorScope, competitorValidity } from "./support/competitor-analysis-fixtures";

const count = (unit: "COMPETITOR_LOCATIONS" | "UNIQUE_COMPETITOR_ENTITIES", data = competitorEvidence(), coverage: unknown = competitorCoverage(), request = competitorRequest()) =>
  assessCompetitorCount(data, request, coverage, unit, competitorInstant);
describe("Competitor M1 entity/location/source-record identity", () => {
  it("one unified competitor and fifteen branches are 1 entity / 15 locations, not fifteen competitors", () => {
    const evidence = competitorEvidence(15); const coverage = competitorCoverage(15);
    expect(count("UNIQUE_COMPETITOR_ENTITIES", evidence, coverage)).toMatchObject({ status: "COMPUTED", value: 1 });
    expect(count("COMPETITOR_LOCATIONS", evidence, coverage)).toMatchObject({ status: "COMPUTED", value: 15 });
    expect(describeCompetitorIdentity(evidence, competitorInstant).entities[0]?.locationIds).toHaveLength(15);
  });
  it("fifteen original source records can evidence one location without becoming fifteen locations", () => {
    const evidence = competitorEvidence();
    for (let i = 1; i < 15; i++) {
      const source = { ...evidence.sourceRecords[0]!, sourceRecordId: `extra:${i}` };
      evidence.sourceRecords.push(source); evidence.locations[0]!.evidence.push(competitorRef(source.sourceRecordId));
    }
    expect(count("COMPETITOR_LOCATIONS", evidence)).toMatchObject({ value: 1 });
    expect(normalizeCompetitorEvidence(evidence).locations[0]?.evidence).toHaveLength(15);
  });
  it("namespaces preserve identical original record ids from different sources", () => {
    const evidence = competitorEvidence();
    evidence.sourceRecords.push({ ...evidence.sourceRecords[0]!, sourceNamespace: "other-register" });
    expect(normalizeCompetitorEvidence(evidence).sourceRecords).toHaveLength(5);
  });
  it("collapses only exact repeated canonical rows and preserves all original references", () => {
    const evidence = competitorEvidence();
    evidence.locations.push(structuredClone(evidence.locations[0]!));
    expect(normalizeCompetitorEvidence(evidence).locations).toHaveLength(1);
    evidence.locations[1]!.identityReason = "Conflicting declaration";
    expect(() => normalizeCompetitorEvidence(evidence)).toThrow(EngineError);
  });
  it.each(["SEPARATE_UNVERIFIED", "AMBIGUOUS", "CONFLICTED"] as const)("does not turn %s entity links into one business per branch", (state) => {
    const evidence = competitorEvidence(2);
    for (const location of evidence.locations) {
      location.competitorEntityId = null; location.entityLinkState = "AMBIGUOUS"; location.entityLinkEvidence = [];
    }
    evidence.entities[0]!.identityState = state; evidence.entities[0]!.identityMethod = "UNRESOLVED";
    expect(count("UNIQUE_COMPETITOR_ENTITIES", evidence, competitorCoverage(2))).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
    expect(count("COMPETITOR_LOCATIONS", evidence, competitorCoverage(2))).toMatchObject({ status: "COMPUTED", value: 2 });
  });
  it("does not merge same brand/name entities and rejects conflicting canonical identities for one source record", () => {
    const evidence = competitorEvidence();
    evidence.entities.push({ ...evidence.entities[0]!, competitorEntityId: "entity:franchise" });
    expect(() => describeCompetitorIdentity(evidence, competitorInstant)).toThrow(EngineError);
    evidence.entities[1]!.evidence = [competitorRef("inventory:all")];
    expect(describeCompetitorIdentity(evidence, competitorInstant).entities).toHaveLength(2);
  });
  it("rejects two canonical location ids for one established entity branch", () => {
    const evidence = competitorEvidence(2);
    evidence.locations[1]!.branchId = evidence.locations[0]!.branchId;
    expect(() => describeCompetitorIdentity(evidence, competitorInstant)).toThrow(EngineError);
  });
  it("does not manufacture a resolution method or a missing entity", () => {
    const evidence = competitorEvidence();
    evidence.entities[0]!.identityMethod = "UNRESOLVED";
    expect(() => normalizeCompetitorEvidence(evidence)).toThrow();
    evidence.entities[0]!.identityMethod = "AUTHORITATIVE_IDENTIFIER";
    evidence.locations[0]!.competitorEntityId = "missing";
    expect(() => normalizeCompetitorEvidence(evidence)).toThrow();
  });
  it("requires explicit typed identity links, not brand/phone/name similarity", () => {
    const link = { contract: "jenan.competitor-analysis.identity-link/v1", id: "link:1", kind: "SAME_ENTITY",
      leftRecord: competitorRef("one"), rightRecord: competitorRef("two"), canonicalId: "entity:one",
      certainty: "RESOLVED", reason: "Explicit legal identifier", evidence: [competitorRef("proof")], limitations: [], validity: competitorValidity };
    expect(competitorIdentityLinkSchema.parse(link).kind).toBe("SAME_ENTITY");
    expect(competitorIdentityLinkSchema.safeParse({ ...link, kind: "SIMILAR_NAME" }).success).toBe(false);
    expect(competitorIdentityLinkSchema.safeParse({ ...link, rightRecord: link.leftRecord }).success).toBe(false);
  });
  it.each(["entity", "location"] as const)("strict %s contract rejects strength/estimated revenue and unknown keys", (kind) => {
    const data = competitorEvidence();
    const schema = kind === "entity" ? competitorEntitySchema : competitorLocationSchema;
    const row = kind === "entity" ? data.entities[0]! : data.locations[0]!;
    expect(schema.safeParse({ ...row, strength: 87, estimatedRevenue: 1000 }).success).toBe(false);
  });
});
describe("Competitor M1 supported matching, independent from activity", () => {
  it.each(["DIRECT", "INDIRECT", "POTENTIAL", "NOT_COMPARABLE"] as const)("classifies %s only through explicit source-backed rules", (relationship) => {
    const evidence = competitorEvidence(); evidence.rules[0]!.relationship = relationship;
    evidence.rules[0]!.criterion = ({ DIRECT: "SAME_NEED", INDIRECT: "DOCUMENTED_SUBSTITUTION", POTENTIAL: "DOCUMENTED_POTENTIAL", NOT_COMPARABLE: "DOCUMENTED_EXCLUSION" } as const)[relationship];
    const result = classifyCompetitorLocation(evidence, "location:0", competitorScope, competitorInstant);
    expect(result).toMatchObject({ relationship, evidenceState: "SUPPORTED", reason: evidence.rules[0]!.reason, confidence: { policyId: "competitor-confidence-v1" } });
    expect(result.evidence).not.toHaveLength(0); expect(result.ruleRefs).toHaveLength(1);
    expect(competitorMatchSchema.safeParse({ ...result, evidence: [] }).success).toBe(false);
  });
  it("name/activity proximity without an exact applicable rule remains UNKNOWN", () => {
    const evidence = competitorEvidence(); evidence.locations[0]!.activityCodes = ["broad-food-category"];
    expect(classifyCompetitorLocation(evidence, "location:0", competitorScope, competitorInstant)).toMatchObject({ relationship: "UNKNOWN", evidenceState: "INSUFFICIENT" });
  });
  it("a broad category never becomes DIRECT or INDIRECT even if its text matches a rule", () => {
    const evidence = competitorEvidence(); evidence.locations[0]!.activitySpecificity = "BROAD";
    expect(classifyCompetitorLocation(evidence, "location:0", competitorScope, competitorInstant).relationship).toBe("UNKNOWN");
    evidence.locations[0]!.activitySpecificity = "SPECIFIC"; evidence.locations[0]!.activityTaxonomy.version = "2";
    expect(classifyCompetitorLocation(evidence, "location:0", competitorScope, competitorInstant).relationship).toBe("UNKNOWN");
  });
  it("conflicting rules stay ambiguous instead of choosing DIRECT", () => {
    const evidence = competitorEvidence();
    evidence.rules.push({ ...evidence.rules[0]!, rule: { id: "exclusion", version: "1" }, relationship: "NOT_COMPARABLE", criterion: "DOCUMENTED_EXCLUSION" });
    expect(classifyCompetitorLocation(evidence, "location:0", competitorScope, competitorInstant)).toMatchObject({ relationship: "UNKNOWN", evidenceState: "AMBIGUOUS" });
    expect(count("COMPETITOR_LOCATIONS", evidence)).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
  });
  it("does not equate DIRECT with ACTIVE, or unknown activity with inactivity", () => {
    const evidence = competitorEvidence(); evidence.locations[0]!.operationalState = "UNKNOWN"; evidence.locations[0]!.operationalEvidence = [];
    expect(classifyCompetitorLocation(evidence, "location:0", competitorScope, competitorInstant).relationship).toBe("DIRECT");
    expect(count("COMPETITOR_LOCATIONS", evidence)).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
    const request = competitorRequest(); request.activityFilter = "ALL_DOCUMENTED";
    expect(count("COMPETITOR_LOCATIONS", evidence, competitorCoverage(), request).value).toBe(1);
  });
  it("enforces geography, rule version and validity without fallback", () => {
    const evidence = competitorEvidence();
    evidence.rules[0]!.targetActivity.version = "2";
    expect(classifyCompetitorLocations(evidence, competitorScope, competitorInstant)[0]?.relationship).toBe("UNKNOWN");
    evidence.rules[0]!.targetActivity.version = "1"; evidence.rules[0]!.validity.end = "2026-10-22T12:00:00.000Z";
    expect(classifyCompetitorLocations(evidence, competitorScope, competitorInstant)[0]?.relationship).toBe("UNKNOWN");
  });
  it("rejects unresolved source references and does not repair malformed evidence", () => {
    const evidence = competitorEvidence(); evidence.locations[0]!.evidence = [competitorRef("nonexistent")];
    expect(() => classifyCompetitorLocations(evidence, competitorScope, competitorInstant)).toThrow();
    expect(() => normalizeCompetitorEvidence({ ...competitorEvidence(), sourceRecords: [] })).toThrow();
  });
  it("cannot invent a documented observation method from a listing or name", () => {
    const evidence = competitorEvidence();
    for (const row of evidence.sourceRecords) { row.measurementMethod = "UNSUPPORTED"; row.method = null; }
    expect(classifyCompetitorLocation(evidence, "location:0", competitorScope, competitorInstant).relationship).toBe("UNKNOWN");
    expect(count("COMPETITOR_LOCATIONS", evidence)).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
  });
});
describe("Competitor M1 count semantics and honest gaps", () => {
  it("allows zero only from explicit complete scoped inventory", () => {
    expect(count("COMPETITOR_LOCATIONS", competitorEvidence(0), competitorCoverage(0))).toMatchObject({ status: "COMPUTED", value: 0 });
    const coverage = competitorCoverage(0); coverage.status = "PARTIAL";
    expect(count("COMPETITOR_LOCATIONS", competitorEvidence(0), coverage)).toMatchObject({ status: "NO_COVERAGE", value: null });
  });
  it.each(["PARTIAL", "UNKNOWN"] as const)("keeps %s total null and labels the observed subset", (status) => {
    const coverage = competitorCoverage(); coverage.status = status;
    expect(count("COMPETITOR_LOCATIONS", competitorEvidence(), coverage)).toMatchObject({ status: "PARTIAL", value: null, observedSubset: 1, confidence: null });
  });
  it.each(["SAMPLE", "UNKNOWN"] as const)("does not present %s source completeness as a complete total", (completeness) => {
    const evidence = competitorEvidence(); evidence.inputs[0]!.completeness = completeness;
    expect(count("UNIQUE_COMPETITOR_ENTITIES", evidence)).toMatchObject({ status: "PARTIAL", value: null, observedSubset: 1 });
  });
  it("returns NOT_AVAILABLE for missing scope evidence and NO_COVERAGE for incompatible scope", () => {
    expect(count("COMPETITOR_LOCATIONS", competitorEvidence(), null)).toMatchObject({ status: "NOT_AVAILABLE", value: null });
    const coverage = competitorCoverage(); coverage.scope.geography.code = "other";
    expect(count("COMPETITOR_LOCATIONS", competitorEvidence(), coverage)).toMatchObject({ status: "NO_COVERAGE", value: null });
  });
  it("does not substitute source rows or a different enumeration for the declared inventory", () => {
    const coverage = competitorCoverage(); coverage.inventoryLocationIds = [];
    expect(count("COMPETITOR_LOCATIONS", competitorEvidence(), coverage)).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
  });
  it("a rule source alone cannot attest zero location coverage", () => {
    const evidence = competitorEvidence(0); evidence.inputs[0]!.roles = ["competitor.matching-rules"];
    expect(count("COMPETITOR_LOCATIONS", evidence, competitorCoverage(0))).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
  });
  it("refuses unknown segment membership rather than silently broadening the scope", () => {
    const request = competitorRequest(); request.scope.segment = { id: "premium", version: "1" };
    const coverage = { ...competitorCoverage(), scope: request.scope };
    expect(count("COMPETITOR_LOCATIONS", competitorEvidence(), coverage, request)).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
  });
  it("does not count forbidden or expired evidence, even if the supplied descriptor says FRESH", () => {
    const evidence = competitorEvidence(); evidence.inputs[0]!.freshness.expiresAt = competitorInstant;
    expect(count("COMPETITOR_LOCATIONS", evidence).value).toBeNull();
  });
  it.each(["DENIED", "NOT_VERIFIED"] as const)("never derives even a partial observed count from %s analysis permission", (analysisUsage) => {
    const evidence = competitorEvidence(); evidence.permissions[0]!.analysisUsage = analysisUsage;
    const coverage = competitorCoverage(); coverage.status = "PARTIAL";
    expect(count("COMPETITOR_LOCATIONS", evidence, coverage)).toMatchObject({ status: "NOT_COMPUTABLE", value: null, observedSubset: null });
  });
  it("expired usage decisions do not grant current analysis permission", () => {
    const evidence = competitorEvidence(); evidence.permissions[0]!.validity.end = competitorInstant;
    expect(count("COMPETITOR_LOCATIONS", evidence)).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
  });
});
describe("Competitor M1 deterministic normalization and request limits", () => {
  it("normalizes unordered sets and exact duplicates without mutating caller data", () => {
    const evidence = competitorEvidence(15); const before = structuredClone(evidence);
    const first = canonicalHash(normalizeCompetitorEvidence(evidence));
    evidence.entities.reverse(); evidence.locations.reverse(); evidence.sourceRecords.reverse();
    evidence.locations[0]!.evidence.push(...evidence.locations[0]!.evidence);
    expect(canonicalHash(normalizeCompetitorEvidence(evidence))).toBe(first);
    expect(before.locations).toHaveLength(15);
    const copy = structuredClone(before); normalizeCompetitorEvidence(copy); expect(copy).toEqual(before);
  });
  it("normalizes selections and includes the explicit evaluation instant in the request hash", () => {
    const request = competitorRequest();
    const first = normalizeCompetitorRequest(request, competitorInstant);
    request.analyses.reverse(); request.countingUnits.reverse();
    expect(normalizeCompetitorRequest(request, competitorInstant)).toEqual(first);
    expect(normalizeCompetitorRequest(request, "2026-10-23T12:00:00.000Z").requestHash).not.toBe(first.requestHash);
  });
  it("does not hash away an entity-versus-location change", () => {
    const first = competitorRequest(); first.countingUnits = ["COMPETITOR_LOCATIONS"];
    const second = competitorRequest(); second.countingUnits = ["UNIQUE_COMPETITOR_ENTITIES"];
    expect(normalizeCompetitorRequest(first, competitorInstant).requestHash).not.toBe(normalizeCompetitorRequest(second, competitorInstant).requestHash);
  });
  it("rejects noncanonical precision and reserved future analyses instead of silently enabling M3", () => {
    const request = competitorRequest(); request.scope.asOf = "2026-10-22T12:00:00Z";
    expect(() => normalizeCompetitorRequest(request, competitorInstant)).toThrow();
    request.scope.asOf = "2026-10-22T12:00:00.0001Z";
    expect(() => normalizeCompetitorRequest(request, competitorInstant)).toThrow();
    request.scope.asOf = competitorInstant; request.analyses = ["DISTRIBUTION"];
    expect(() => normalizeCompetitorRequest(request, competitorInstant)).toThrow(EngineError);
  });
  it.each([
    { relationships: ["DIRECT", "DIRECT"] }, { countingUnits: [] }, { scope: { ...competitorScope, radius: 1000 } },
    { externalUrl: "https://example.test" }, { analyses: ["RECOMMENDATION"] }, { analyses: ["MARKET_SHARE"] },
    { analyses: ["COMPETITOR_REVENUE"] }, { actor: "administrator" },
  ])("rejects unsupported fields/claims %j", (change) => {
    expect(competitorRequestSchema.safeParse({ ...competitorRequest(), ...change }).success).toBe(false);
  });
  it("rejects excessive pins, duplicate versions, unknown roles, future evaluation and oversized payloads", () => {
    const request = competitorRequest();
    request.data.roles["competitor.locations"] = Array.from({ length: 32 }, (_, i) => ({ versionId: `v:${i}` }));
    request.data.roles["competitor.entities"] = [{ versionId: "extra" }];
    expect(() => normalizeCompetitorRequest(request, competitorInstant)).toThrow();
    expect(() => normalizeCompetitorRequest(competitorRequest(), "2026-10-21T12:00:00.000Z")).toThrow();
    expect(() => normalizeCompetitorRequest({ ...competitorRequest(), x: "x".repeat(2 * 1024 * 1024) }, competitorInstant)).toThrow(EngineError);
    expect(() => normalizeCompetitorEvidence(competitorEvidence(2_001))).toThrow();
  });
  it("rejects a published-version alias and wrong-governance/role input", () => {
    const evidence = competitorEvidence(); evidence.inputs.push({ ...evidence.inputs[0]!, id: "dc:alias" });
    expect(() => normalizeCompetitorEvidence(evidence)).toThrow();
    const wrong = competitorEvidence(); wrong.inputs[0]!.roles = ["population"];
    expect(() => normalizeCompetitorEvidence(wrong)).toThrow();
  });
});
