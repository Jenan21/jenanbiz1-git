import { beforeEach, describe, expect, it, vi } from "vitest";
import { readyFixtureFiles } from "./jenan-map-artifact-fixtures";

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), validate: vi.fn(), layers: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query, $executeRaw: mocks.execute, $transaction: mocks.transaction } }));
vi.mock("@/services/jenan-map/validation", async (original) => ({
  ...await original<typeof import("@/services/jenan-map/validation")>(), validateReleaseArtifacts: mocks.validate,
}));
vi.mock("@/services/jenan-map/layers", async (original) => ({
  ...await original<typeof import("@/services/jenan-map/layers")>(), releaseManifestLayers: mocks.layers,
}));

import { command, preverifyCommand } from "@/services/jenan-map/service";
import type { MapCommand } from "@/services/jenan-map/contracts";

const releaseId = "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1";
const otherId = "3c1b5f07-9581-4e3b-a0a3-9fc7ea08ead3";
const state = { status: "enabled", publishedReleaseId: otherId, revision: 4 };
const release = (status: string, id = releaseId) => ({ id, version: "v1", status, publishedAt: new Date(), reviewedBy: "admin", reviewedAt: new Date() });
const counts = { boundaries: BigInt(1), features: BigInt(1), authority: "Fixture authority", source: "Synthetic unit fixture only" };
const files = readyFixtureFiles().map(({ artifact }) => artifact);
const style = { layers: [{ id: "places" }] };
const approve: MapCommand = { action: "approve", releaseId, reason: "Human review confirmed", confirmation: "APPROVE" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (callback) => callback({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
  mocks.validate.mockResolvedValue(style);
  mocks.layers.mockResolvedValue([{ id: "base", available: true, styleLayerIds: ["places"] }]);
});

describe("artifact verification happens before the command's transaction", () => {
  it("verifies every artifact in full once, ahead of the transaction, and the transaction does not repeat it", async () => {
    mocks.query.mockResolvedValueOnce([release("Ready")]).mockResolvedValueOnce([counts]).mockResolvedValueOnce(files);
    const verified = await preverifyCommand(approve);
    expect(verified).toMatchObject({ releaseId, style });
    expect(mocks.validate).toHaveBeenCalledTimes(1);
    expect(mocks.validate.mock.calls[0][0]).toBe(files);
    expect(mocks.validate.mock.calls[0][1]).toBe(true);
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release("Ready")]).mockResolvedValueOnce([counts]).mockResolvedValueOnce(files);
    await command(approve, "admin", verified);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.validate).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0][0].text).toContain("status = 'Approved'");
  });

  it("without a prior verification the transaction still verifies in full, as before", async () => {
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release("Ready")]).mockResolvedValueOnce([counts]).mockResolvedValueOnce(files);
    await command(approve, "admin");
    expect(mocks.validate).toHaveBeenCalledTimes(1);
    expect(mocks.validate.mock.calls[0][1]).toBe(true);
  });

  it("repeats the verification inside the transaction when the release no longer holds what was verified", async () => {
    mocks.query.mockResolvedValueOnce([release("Ready")]).mockResolvedValueOnce([counts]).mockResolvedValueOnce(files);
    const verified = await preverifyCommand(approve);
    const changed = [...files, { ...files[0], id: "9c1b5f07-9581-4e3b-a0a3-9fc7ea08ead9", filename: "later.geojson", sha256: "b".repeat(64) }];
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release("Ready")]).mockResolvedValueOnce([counts]).mockResolvedValueOnce(changed);
    await command(approve, "admin", verified);
    expect(mocks.validate).toHaveBeenCalledTimes(2);
    expect(mocks.validate.mock.calls[1][0]).toBe(changed);
  });

  it("repeats it when the boundary evidence changed, or the evidence belongs to another release", async () => {
    mocks.query.mockResolvedValueOnce([release("Ready")]).mockResolvedValueOnce([counts]).mockResolvedValueOnce(files);
    const verified = await preverifyCommand(approve);
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release("Ready")]).mockResolvedValueOnce([{ ...counts, authority: "Another authority" }]).mockResolvedValueOnce(files);
    await command(approve, "admin", verified);
    expect(mocks.validate).toHaveBeenCalledTimes(2);

    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release("Ready")]).mockResolvedValueOnce([counts]).mockResolvedValueOnce(files);
    await command(approve, "admin", { ...verified!, releaseId: otherId });
    expect(mocks.validate).toHaveBeenCalledTimes(3);
  });

  it("an invalid artifact is refused before any transaction opens", async () => {
    mocks.query.mockResolvedValueOnce([release("Ready")]).mockResolvedValueOnce([counts]).mockResolvedValueOnce(files);
    mocks.validate.mockRejectedValueOnce(Object.assign(new Error("ARTIFACT_INTEGRITY_FAILED"), { code: "ARTIFACT_INTEGRITY_FAILED" }));
    await expect(preverifyCommand(approve)).rejects.toThrow("ARTIFACT_INTEGRITY_FAILED");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("verifies the published release before enabling the map", async () => {
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release("Published", otherId)]).mockResolvedValueOnce([counts]).mockResolvedValueOnce(files);
    const verified = await preverifyCommand({ action: "runtime", status: "enabled", expectedRevision: 4, reason: "Enable the service", confirmation: "CHANGE RUNTIME" });
    expect(verified?.releaseId).toBe(otherId);
    expect(mocks.validate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["approve a release that is not Ready", approve, "Published"],
    ["publish a release that is not Approved", { action: "publish", releaseId, expectedRevision: 4, expectedPublishedReleaseId: null, confirmation: "PUBLISH", reason: "Release confirmed" } as MapCommand, "Ready"],
    ["roll back to a release that is not Archived", { action: "rollback", releaseId, expectedRevision: 4, expectedPublishedReleaseId: null, confirmation: "ROLLBACK", reason: "Restore reviewed release" } as MapCommand, "Approved"],
  ])("does not read any artifact when asked to %s", async (_name, input, status) => {
    mocks.query.mockResolvedValueOnce([release(status)]);
    expect(await preverifyCommand(input)).toBeUndefined();
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.validate).not.toHaveBeenCalled();
  });

  it("does not verify for commands that do not need it, or when nothing is ready or published", async () => {
    for (const input of [
      { action: "create", version: "v2", source: "Protomaps", sourceDate: "2026-10-01T00:00:00Z", license: "ODbL-1.0" },
      { action: "archive", releaseId, reason: "Archive this release", confirmation: "ARCHIVE" },
      { action: "runtime", status: "maintenance", expectedRevision: 4, reason: "Planned maintenance", confirmation: "CHANGE RUNTIME" },
    ] as MapCommand[]) expect(await preverifyCommand(input)).toBeUndefined();
    expect(mocks.query).not.toHaveBeenCalled();

    const enable: MapCommand = { action: "runtime", status: "enabled", expectedRevision: 4, reason: "Enable the service", confirmation: "CHANGE RUNTIME" };
    mocks.query.mockResolvedValueOnce([{ ...state, publishedReleaseId: null }]);
    expect(await preverifyCommand(enable)).toBeUndefined();
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release("Archived", otherId)]);
    expect(await preverifyCommand(enable)).toBeUndefined();
    mocks.query.mockRejectedValueOnce(new Error("no such release"));
    expect(await preverifyCommand(approve)).toBeUndefined();

    // Not ready (no boundary): the transaction reports RELEASE_NOT_READY itself; nothing is hashed here.
    mocks.query.mockResolvedValueOnce([release("Ready")]).mockResolvedValueOnce([{ ...counts, boundaries: BigInt(0) }]).mockResolvedValueOnce(files);
    expect(await preverifyCommand(approve)).toBeUndefined();
    mocks.query.mockResolvedValueOnce([release("Ready")]).mockResolvedValueOnce([counts]).mockResolvedValueOnce([files[0]]);
    expect(await preverifyCommand(approve)).toBeUndefined();
    expect(mocks.validate).not.toHaveBeenCalled();
  });
});
