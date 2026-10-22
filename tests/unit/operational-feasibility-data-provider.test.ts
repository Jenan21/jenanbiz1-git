import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ discover: vi.fn(), read: vi.fn() }));
vi.mock("@/services/data-center/discovery", () => ({ discoverDataCenterVersions: mocks.discover }));
vi.mock("@/services/data-center/version-content", () => ({ readDataCenterVersionContent: mocks.read }));
import { DataCenterError } from "@/services/data-center/contracts";
import { createOperationalDataCenterProvider } from "@/services/analysis-engines/operational-feasibility/adapters/data-center-provider";
import { operationalContext } from "./support/operational-feasibility-fixtures";
import { operationalPortFixture } from "./support/operational-data-fixtures";

describe("Operational adapter uses only governed exact read capabilities", () => {
  const actor = { id: "principal", kind: "HUMAN" as const, systemRole: "USER" };
  it.each(["PUBLISHED_VERSION_NOT_FOUND", "VERSION_CHECKSUM_MISMATCH", "EXPECTED_CHECKSUM_MISMATCH"])("maps only defined %s errors", async (code) => {
    mocks.read.mockRejectedValue(new DataCenterError(code, 404));
    const port = createOperationalDataCenterProvider(actor, operationalContext);
    expect(await port.read({ versionId: "pin", expectedChecksum: "a".repeat(64) })).toEqual({ status: code === "PUBLISHED_VERSION_NOT_FOUND" ? "NOT_AVAILABLE" : "INTEGRITY_ERROR" });
  });
  it("propagates authorization policy errors and backend outages", async () => {
    const port = createOperationalDataCenterProvider(actor, operationalContext);
    for (const error of [new DataCenterError("EXPLICIT_ROBOT_GRANT_REQUIRED", 403), new Error("DB offline")]) {
      mocks.read.mockRejectedValue(error);
      await expect(port.read({ versionId: "pin", expectedChecksum: "a".repeat(64) })).rejects.toBe(error);
    }
  });
  it("rechecks trusted organization scope before direct read and never uses unscoped bytes", async () => {
    mocks.read.mockClear(); mocks.discover.mockResolvedValue({ candidates: [] });
    const port = createOperationalDataCenterProvider(actor, { ...operationalContext, organizationId: "org", specialty: "ops", missionContext: "study" });
    expect(await port.read({ versionId: "pin", expectedChecksum: "a".repeat(64) })).toEqual({ status: "NOT_AVAILABLE" });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.discover).toHaveBeenLastCalledWith({ versionIds: ["pin"], layer: "DATA", organizationId: "org", specialty: "ops", missionContext: "study" }, actor, { now: new Date(operationalContext.evaluatedAt) });
  });
  it("pins checksum and copies the trusted actor/context instead of accepting later caller mutation", async () => {
    const f = operationalPortFixture(); const response = await f.read({ versionId: "x", expectedChecksum: "x" });
    mocks.read.mockResolvedValue(response);
    const trustedActor = { ...actor }; const trustedContext = { evaluatedAt: operationalContext.evaluatedAt, specialty: "ops", missionContext: "study" };
    const port = createOperationalDataCenterProvider(trustedActor, trustedContext);
    trustedActor.id = "mutated"; trustedContext.specialty = "other";
    expect(await port.read({ versionId: "exact-pin", expectedChecksum: "b".repeat(64) })).toEqual(response);
    expect(mocks.read).toHaveBeenLastCalledWith({ versionId: "exact-pin", expectedChecksum: "b".repeat(64), specialty: "ops", missionContext: "study" }, actor, { now: new Date(operationalContext.evaluatedAt) });
  });
});
