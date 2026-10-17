import { describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: dbMocks.query, $transaction: dbMocks.transaction } }));

import { assertLayerCanEnable, layerChangeSchema, type StoredMapLayer } from "@/services/jenan-map/layers";

const layer: StoredMapLayer = {
  id: "population", label: "السكان", enabled: false, visibility: "public",
  status: "ready", releaseId: "approved-release", source: "licensed-source",
  version: "dated-version", sourceDate: new Date("2026-10-01"), license: "licensed",
  confidence: null, updatedAt: null, revision: 0, styleLayerIds: ["population-fill"],
};

describe("Jenan map layer publication boundary", () => {
  it("requires explicit revision and confirmation", () => {
    expect(layerChangeSchema.safeParse({ id: "roads", enabled: true }).success).toBe(false);
    expect(layerChangeSchema.safeParse({
      id: "roads", enabled: false, expectedRevision: 0, confirmation: "CHANGE LAYER",
    }).success).toBe(true);
  });
  it("never enables missing, stale or internal data", () => {
    for (const change of [
      { status: "unavailable" as const }, { source: null }, { version: null },
      { releaseId: "other-release" }, { visibility: "internal" as const }, { styleLayerIds: [] },
    ]) expect(() => assertLayerCanEnable({ ...layer, ...change }, "approved-release")).toThrow();
    expect(() => assertLayerCanEnable(layer, null)).toThrow();
  });
  it("permits only an explicitly sourced public layer pinned to the active release", () => {
    expect(() => assertLayerCanEnable(layer, "approved-release")).not.toThrow();
    expect(layer.confidence).toBeNull();
  });

  it("reads release-specific style bindings and persists policy changes against the active release", async () => {
    const queries = [
      [{ publishedReleaseId: "approved-release" }],
      [layer],
    ];
    dbMocks.query.mockImplementation(async () => queries.shift());
    const tx = {
      $queryRaw: dbMocks.query,
      $executeRaw: dbMocks.execute,
      auditLog: { create: vi.fn() },
    };
    dbMocks.transaction.mockImplementation(async (callback, options) => {
      expect(options).toMatchObject({ isolationLevel: "Serializable" });
      return callback(tx);
    });
    const result = await (await import("@/services/jenan-map/layers")).changeMapLayer({
      id: "population", enabled: true, expectedRevision: 0, confirmation: "CHANGE LAYER",
    }, "admin");
    expect(result).toEqual({ id: "population", enabled: true, revision: 1 });
    expect(dbMocks.query.mock.calls[1][0].text).toContain("jenan_map.release_layer");
    expect(dbMocks.execute.mock.calls[0][0].text).toContain("UPDATE jenan_map.layer");
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actorId: "admin", action: "jenan_map.layer.updated" }),
    }));
  });
});
