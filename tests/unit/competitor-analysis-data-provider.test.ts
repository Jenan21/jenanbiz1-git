import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ discover: vi.fn(), read: vi.fn() }));
vi.mock("@/services/data-center/discovery", () => ({ discoverDataCenterVersions: mocks.discover }));
vi.mock("@/services/data-center/version-content", () => ({ readDataCenterVersionContent: mocks.read }));
import { DataCenterError } from "@/services/data-center/contracts";
import { createCompetitorDataCenterProvider } from "@/services/analysis-engines/competitor-analysis/adapters/data-center-provider";
import { competitorInstant } from "./support/competitor-analysis-fixtures";
import { competitorReference } from "./support/competitor-data-fixtures";

const actor = { id: "user:1", systemRole: "USER", kind: "HUMAN" as const };
const query = { versionId: "locations-1", expectedChecksum: "a".repeat(64) };
beforeEach(() => { mocks.read.mockReset(); mocks.discover.mockReset(); });
describe("Competitor M2 trusted Data Center read provider", () => {
  it("uses only trusted actor/time/specialty/mission/org and captures them against caller mutation", async () => {
    const trustedActor = { ...actor }; const context = { evaluatedAt: competitorInstant, specialty: "retail", missionContext: "m:1", organizationId: "org:1" };
    const provider = createCompetitorDataCenterProvider(trustedActor, context);
    trustedActor.systemRole = "ADMIN"; context.specialty = "other";
    await provider.discover({ typeKeys: ["competitor-locations"], asOf: competitorInstant });
    expect(mocks.discover).toHaveBeenCalledWith({ typeKeys: ["competitor-locations"], asOf: competitorInstant, layer: "DATA",
      specialty: "retail", missionContext: "m:1", organizationId: "org:1" }, actor, { now: new Date(competitorInstant) });
  });
  it.each(["PUBLISHED_VERSION_NOT_FOUND"] as const)("returns identical generic unavailable for hidden, absent or withdrawn version: %s", async (code) => {
    mocks.read.mockRejectedValue(new DataCenterError(code, 404));
    expect(await createCompetitorDataCenterProvider(actor, { evaluatedAt: competitorInstant }).read(query)).toEqual({ status: "NOT_AVAILABLE" });
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it.each(["VERSION_CHECKSUM_MISMATCH", "EXPECTED_CHECKSUM_MISMATCH"])("exposes %s as integrity failure, not a fallback", async (code) => {
    mocks.read.mockRejectedValue(new DataCenterError(code, 409));
    expect(await createCompetitorDataCenterProvider(actor, { evaluatedAt: competitorInstant }).read(query)).toEqual({ status: "INTEGRITY_ERROR" });
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("does not read a version outside the trusted organization scope", async () => {
    mocks.discover.mockResolvedValue({ candidates: [] });
    const provider = createCompetitorDataCenterProvider(actor, { evaluatedAt: competitorInstant, organizationId: "org:1" });
    expect(await provider.read(query)).toEqual({ status: "NOT_AVAILABLE" }); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("still invokes the current Data Center exact reader after organization-scoped discovery", async () => {
    const reference = competitorReference("competitor.locations");
    mocks.discover.mockResolvedValue({ candidates: [{ reference }] });
    mocks.read.mockResolvedValue({ reference, content: "{}", contentKind: "OTHER", integrity: { algorithm: "SHA-256", checksum: query.expectedChecksum, recomputed: true }, features: null });
    const provider = createCompetitorDataCenterProvider(actor, { evaluatedAt: competitorInstant, organizationId: "org:1" });
    expect(await provider.read(query)).toMatchObject({ status: "AVAILABLE", reference, contentKind: "OTHER" });
    expect(mocks.read).toHaveBeenCalledWith({ ...query, specialty: undefined, missionContext: undefined }, actor, { now: new Date(competitorInstant) });
  });
  it("does not hide policy/backend errors or unexpected programming faults", async () => {
    const provider = createCompetitorDataCenterProvider(actor, { evaluatedAt: competitorInstant });
    mocks.read.mockRejectedValue(new DataCenterError("ROBOT_ACCESS_DENIED", 403));
    await expect(provider.read(query)).rejects.toMatchObject({ code: "ROBOT_ACCESS_DENIED" });
    mocks.read.mockRejectedValue(new Error("database offline"));
    await expect(provider.read(query)).rejects.toThrow("database offline");
  });
});
