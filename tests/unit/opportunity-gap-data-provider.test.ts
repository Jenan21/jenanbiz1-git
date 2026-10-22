import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ discover: vi.fn(), read: vi.fn() }));
vi.mock("@/services/data-center/discovery", () => ({ discoverDataCenterVersions: mocks.discover }));
vi.mock("@/services/data-center/version-content", () => ({ readDataCenterVersionContent: mocks.read }));
import { DataCenterError } from "@/services/data-center/contracts";
import { createOpportunityDataCenterProvider } from "@/services/analysis-engines/opportunity-gap/adapters/data-center-provider";
import { evaluatedAt } from "./support/analysis-engine-fixtures";
import { opportunityPortFixture } from "./support/opportunity-data-fixtures";
const actor = { id: "user:1", systemRole: "USER", kind: "HUMAN" as const };
const query = { versionId: "need-v1", expectedChecksum: "a".repeat(64) };
beforeEach(() => { mocks.discover.mockReset(); mocks.read.mockReset(); });
describe("Opportunity M2 narrow governed Data Center provider", () => {
  it("captures trusted actor/context and forwards exact IDs without arbitrary client selectors", async () => {
    const fixture = opportunityPortFixture();
    mocks.discover.mockImplementation(fixture.discover);
    const trusted = { ...actor }; const context = { evaluatedAt, specialty: "clinic", missionContext: "mission:1", organizationId: "org:1" };
    const provider = createOpportunityDataCenterProvider(trusted, context); trusted.systemRole = "ADMIN"; context.specialty = "changed";
    await provider.discover({ versionIds: ["need-v1"] });
    expect(mocks.discover).toHaveBeenCalledWith({ versionIds: ["need-v1"], layer: "DATA", specialty: "clinic", missionContext: "mission:1", organizationId: "org:1" }, actor, { now: new Date(evaluatedAt) });
  });
  it("makes hidden and missing reads indistinguishable", async () => {
    mocks.read.mockRejectedValue(new DataCenterError("PUBLISHED_VERSION_NOT_FOUND", 404));
    expect(await createOpportunityDataCenterProvider(actor, { evaluatedAt }).read(query)).toEqual({ status: "NOT_AVAILABLE" });
  });
  it.each(["VERSION_CHECKSUM_MISMATCH", "EXPECTED_CHECKSUM_MISMATCH"])("surfaces %s without fallback", async (code) => {
    mocks.read.mockRejectedValue(new DataCenterError(code, 409));
    expect(await createOpportunityDataCenterProvider(actor, { evaluatedAt }).read(query)).toEqual({ status: "INTEGRITY_ERROR" });
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("does not read outside trusted organization scope", async () => {
    mocks.discover.mockResolvedValue({ candidates: [] });
    expect(await createOpportunityDataCenterProvider(actor, { evaluatedAt, organizationId: "org:1" }).read(query)).toEqual({ status: "NOT_AVAILABLE" });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("reauthorizes through the existing exact reader after organization-scoped discovery", async () => {
    const fixture = opportunityPortFixture(); mocks.discover.mockImplementation(fixture.discover);
    const read = await fixture.read(query); if (read.status !== "AVAILABLE") throw new Error("Fixture unavailable");
    mocks.read.mockResolvedValue(read);
    expect(await createOpportunityDataCenterProvider(actor, { evaluatedAt, organizationId: "org:1" }).read(query)).toMatchObject({ status: "AVAILABLE" });
    expect(mocks.read).toHaveBeenCalledWith({ ...query, specialty: undefined, missionContext: undefined }, actor, { now: new Date(evaluatedAt) });
  });
  it("propagates policy/backend faults explicitly", async () => {
    const provider = createOpportunityDataCenterProvider(actor, { evaluatedAt });
    mocks.read.mockRejectedValue(new DataCenterError("ROBOT_ACCESS_DENIED", 403));
    await expect(provider.read(query)).rejects.toMatchObject({ code: "ROBOT_ACCESS_DENIED" });
    mocks.read.mockRejectedValue(new Error("backend unavailable"));
    await expect(provider.read(query)).rejects.toThrow("backend unavailable");
  });
});
