import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ discover: vi.fn(), read: vi.fn() }));
vi.mock("@/services/data-center/discovery", () => ({ discoverDataCenterVersions: mocks.discover }));
vi.mock("@/services/data-center/version-content", () => ({ readDataCenterVersionContent: mocks.read }));
import { DataCenterError } from "@/services/data-center/contracts";
import { createFinancialDataCenterProvider } from "@/services/analysis-engines/financial-feasibility/adapters/data-center-provider";
import { evaluatedAt } from "./support/analysis-engine-fixtures";
import { financialPortFixture } from "./support/financial-data-fixtures";
const actor = { id: "user:financial", kind: "HUMAN" as const, systemRole: "USER" };
const query = { versionId: "financial-v1", expectedChecksum: "a".repeat(64) };
beforeEach(() => { mocks.discover.mockReset(); mocks.read.mockReset(); });
describe("Financial M2 narrow governed provider", () => {
  it("captures trusted context and actor, forwarding only exact authorized selectors", async () => {
    const f = financialPortFixture(); mocks.discover.mockImplementation(f.discover);
    const trusted = { ...actor }; const context = { evaluatedAt, organizationId: "org:1", specialty: "financial", missionContext: "mission:1" };
    const provider = createFinancialDataCenterProvider(trusted, context); trusted.systemRole = "ADMIN"; context.specialty = "changed";
    await provider.discover({ versionIds: ["financial-v1"] });
    expect(mocks.discover).toHaveBeenCalledWith({ versionIds: ["financial-v1"], layer: "DATA", organizationId: "org:1", specialty: "financial", missionContext: "mission:1" }, actor, { now: new Date(evaluatedAt) });
  });
  it("maps hidden and absent content to one unavailable response", async () => {
    mocks.read.mockRejectedValue(new DataCenterError("PUBLISHED_VERSION_NOT_FOUND", 404));
    expect(await createFinancialDataCenterProvider(actor, { evaluatedAt }).read(query)).toEqual({ status: "NOT_AVAILABLE" });
  });
  it.each(["VERSION_CHECKSUM_MISMATCH", "EXPECTED_CHECKSUM_MISMATCH"])("rejects %s without another read or fallback", async (code) => {
    mocks.read.mockRejectedValue(new DataCenterError(code, 409));
    expect(await createFinancialDataCenterProvider(actor, { evaluatedAt }).read(query)).toEqual({ status: "INTEGRITY_ERROR" });
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("checks trusted organization scope before reading bytes", async () => {
    mocks.discover.mockResolvedValue({ candidates: [] });
    expect(await createFinancialDataCenterProvider(actor, { evaluatedAt, organizationId: "org:1" }).read(query)).toEqual({ status: "NOT_AVAILABLE" });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("reauthorizes current bytes via existing exact reader after organization discovery", async () => {
    const f = financialPortFixture(); mocks.discover.mockImplementation(f.discover); mocks.read.mockImplementation(f.read);
    expect(await createFinancialDataCenterProvider(actor, { evaluatedAt, organizationId: "org:1" }).read(query)).toMatchObject({ status: "AVAILABLE" });
    expect(mocks.read).toHaveBeenCalledWith({ ...query, specialty: undefined, missionContext: undefined }, actor, { now: new Date(evaluatedAt) });
  });
  it("propagates explicit robot policy and infrastructure errors", async () => {
    const provider = createFinancialDataCenterProvider(actor, { evaluatedAt });
    mocks.read.mockRejectedValue(new DataCenterError("ROBOT_ACCESS_DENIED", 403));
    await expect(provider.read(query)).rejects.toMatchObject({ code: "ROBOT_ACCESS_DENIED" });
    mocks.read.mockRejectedValue(new Error("backend failed"));
    await expect(provider.read(query)).rejects.toThrow("backend failed");
  });
});
