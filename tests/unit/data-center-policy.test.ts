import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import { commandSchema, itemSchema, sourceSchema } from "@/services/data-center/contracts";
import { assertEvidence, assertSourceAccess, deterministicConfidence } from "@/services/data-center/policy";
import type { DataCenterSource } from "@/generated/prisma/client";

const admin = { id: "admin", systemRole: "ADMIN" };
describe("Data Center governance policy", () => {
  it("accepts the public action contract and rejects arbitrary URL imports", () => {
    expect(commandSchema.parse({ action: "create-source", name: "Official", kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "Internal" }).action).toBe("create-source");
    expect(commandSchema.safeParse({ action: "import-url", url: "http://169.254.169.254" }).success).toBe(false);
    expect(itemSchema.safeParse({ sourceId: "s", title: "t", typeKey: "dataset", layer: "DATA", content: "text", url: "https://example.com" }).success).toBe(false);
  });
  it("requires an organization exclusively for organization scope", () => {
    const base = { name: "source", kind: "MANUAL", owner: "Owner", license: "Private" };
    expect(sourceSchema.safeParse({ ...base, scope: "ORGANIZATION" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...base, scope: "PRIVATE", organizationId: "other-org" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...base, scope: "ORGANIZATION", organizationId: "org" }).success).toBe(true);
  });
  it("never lets AI verify, even with admin role or human-labelled content", () => {
    const verified = { evidenceStatus: "VERIFIED", origin: "HUMAN", provenance: [{ reference: "evidence" }] };
    expect(() => assertEvidence(verified, { ...admin, kind: "AI" })).toThrow("VERIFICATION_REQUIRES");
    expect(() => assertEvidence({ ...verified, origin: "AI" }, admin)).toThrow("VERIFICATION_REQUIRES");
    expect(() => assertEvidence({ ...verified, provenance: [] }, admin)).toThrow("VERIFICATION_REQUIRES");
    expect(() => assertEvidence(verified, { id: "u", systemRole: "USER" })).toThrow("VERIFICATION_REQUIRES");
    expect(() => assertEvidence(verified, admin)).not.toThrow();
  });
  it("keeps estimates and derivations distinct from verification", () => {
    expect(() => assertEvidence({ evidenceStatus: "ESTIMATED", origin: "HUMAN", provenance: [] }, { id: "u", systemRole: "USER" })).not.toThrow();
    expect(() => assertEvidence({ evidenceStatus: "DERIVED", origin: "CALCULATION", provenance: [] }, admin)).toThrow("DERIVATION_PROVENANCE");
  });
  it("computes repeatable factors and never fabricates freshness for missing dates", () => {
    const input = { evidenceStatus: "ESTIMATED", provenanceCount: 2, freshnessDays: 90, origin: "AI", now: new Date("2026-10-17T00:00:00Z") };
    const first = deterministicConfidence(input);
    expect(first).toEqual(deterministicConfidence(input));
    expect(first.score).toBe(24);
    expect(first.factors).toEqual({ evidence: 18, provenance: 6, freshness: 0, origin: 0, sourceReliability: 0, completeness: 0, consistency: 0 });
    expect(Object.keys(first.factors)).toHaveLength(7);
    expect(first.ageDays).toBeNull();
    expect(deterministicConfidence({ ...input, evidenceStatus: "CONFLICTED", sourcePublishedAt: input.now }).score).toBe(0);
    expect(deterministicConfidence({ ...input, sourcePublishedAt: input.now, expiresAt: new Date("2020-01-01") }).expired).toBe(true);
  });
  it("does not leak another user's private source", async () => {
    const source = { scope: "PRIVATE", ownerId: "owner", organizationId: null } as DataCenterSource;
    const tx = { organizationMember: { findMany: vi.fn().mockResolvedValue([]) } };
    await expect(assertSourceAccess(source, { id: "stranger", systemRole: "USER" }, false, tx as never)).rejects.toThrow("SOURCE_NOT_FOUND");
    await expect(assertSourceAccess(source, { id: "owner", systemRole: "USER" }, true, tx as never)).resolves.toBe(source);
  });
  it("rejects caller-supplied origin in public commands", () => {
    expect(commandSchema.safeParse({ action: "create-item", sourceId: "s", title: "proposal", typeKey: "dataset", layer: "DATA", content: "content", origin: "HUMAN" }).success).toBe(false);
    expect(commandSchema.safeParse({ action: "create-version", itemId: "i", title: "proposal", content: "content", reason: "new", origin: "HUMAN" }).success).toBe(false);
  });
});
