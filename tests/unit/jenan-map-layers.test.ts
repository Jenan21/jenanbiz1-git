import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const database = vi.hoisted(() => ({
  $queryRaw: vi.fn(), $executeRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: database }));

import { assertLayerCanEnable, bindReleaseLayers, changeMapLayer, layerChangeSchema, mapLayers, readyLayerSearchFilter, releaseManifestLayers, releaseMapLayers, validateReleaseLayerBindings, type StoredMapLayer } from "@/services/jenan-map/layers";

const layer: StoredMapLayer = {
  id: "population", label: "السكان", enabled: false, visibility: "public",
  status: "ready", releaseId: "approved-release", source: "licensed-source",
  version: "dated-version", confidence: null, updatedAt: null, revision: 0,
  styleLayerIds: ["population-fill"], searchCategories: ["population"], sourceDate: null, license: null,
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

  describe("release-scoped renderer and search binding validation", () => {
    const binding = { id: "roads", styleLayerIds: ["road-line"], searchCategories: ["road"] };
    it("accepts exact real style IDs and defaults to a public binding", () => {
      expect(validateReleaseLayerBindings([binding], ["road-line"])).toEqual([{ ...binding, visibility: "public", confidence: null }]);
    });

    describe("durable release layer storage", () => {
      beforeEach(() => vi.clearAllMocks());

      it("stores validated bindings without overwriting another release or browser provenance", async () => {
        database.$queryRaw.mockResolvedValueOnce([{ id: "roads" }]);
        await bindReleaseLayers(database, "release-a", [
          { id: "roads", styleLayerIds: ["roads-line"], searchCategories: ["road"] },
        ], ["roads-line"]);
        const query = database.$executeRaw.mock.calls[0][0];
        expect(query.sql).toContain("INSERT INTO jenan_map.release_layer");
        expect(query.values).toContain("release-a");
        expect(query.values).toContain("roads-line");
        expect(query.values).toContain("road");
        expect(query.sql).not.toContain("UPDATE");
      });

      it("rejects unknown catalog IDs before persisting any binding", async () => {
        database.$queryRaw.mockResolvedValueOnce([]);
        await expect(bindReleaseLayers(database, "release-a", [
          { id: "roads", styleLayerIds: ["roads-line"] },
        ], ["roads-line"])).rejects.toThrow("INVALID_LAYER_BINDING");
        expect(database.$executeRaw).not.toHaveBeenCalled();
      });

      it("projects only ready enabled public bindings and does not fabricate a renderer ID", async () => {
        database.$queryRaw.mockResolvedValueOnce([
          { ...layer, enabled: true }, layer, { ...layer, enabled: true, styleLayerIds: [] },
          { ...layer, enabled: true, visibility: "internal" },
          { ...layer, enabled: true, status: "unavailable" },
        ]);
        const result = await releaseMapLayers(layer.releaseId!);
        expect(result).toEqual([{ ...layer, enabled: true, available: true }]);
        const query = database.$queryRaw.mock.calls[0][0];
        expect(query.sql).toContain("b.visibility = 'public'");
        expect(query.values).toContain(layer.releaseId);
        const filter = readyLayerSearchFilter(layer.releaseId!);
        expect(filter.sql).toContain("lb.visibility = 'public'");
        expect(filter.sql).toContain("lb.status = 'ready' AND lb.enabled");
        expect(filter.sql).toContain('f.category = ANY(lb."searchCategories")');
        expect(filter.values).toEqual([layer.releaseId]);
      });

      it("retains disabled/unavailable public renderer IDs as unavailable but never includes internal IDs", async () => {
        database.$queryRaw.mockResolvedValueOnce([
          { ...layer, enabled: true },
          { ...layer, id: "roads", enabled: false, styleLayerIds: ["disabled-road"] },
          { ...layer, id: "pois", enabled: true, status: "warning", styleLayerIds: ["warning-pois"] },
          { ...layer, id: "businesses", enabled: true, visibility: "internal", styleLayerIds: ["private-business"] },
        ]);
        const result = await releaseManifestLayers(layer.releaseId!);
        expect(result.map(({ id, available, styleLayerIds }) => ({ id, available, styleLayerIds }))).toEqual([
          { id: layer.id, available: true, styleLayerIds: ["population-fill"] },
          { id: "roads", available: false, styleLayerIds: ["disabled-road"] },
          { id: "pois", available: false, styleLayerIds: ["warning-pois"] },
        ]);
      });

      it("loads the catalog binding for the current pointer, not a mutable legacy release ID", async () => {
        database.$queryRaw.mockResolvedValueOnce([{ publishedReleaseId: "release-b" }]).mockResolvedValueOnce([]);
        await mapLayers();
        expect(database.$queryRaw.mock.calls[1][0].values).toContain("release-b");
        expect(database.$queryRaw.mock.calls[1][0].sql).toContain("LEFT JOIN jenan_map.release_layer");
      });

      it("narrows optional selected layers without dropping bound base city/address search", () => {
        const selected = readyLayerSearchFilter("release-a", ["roads", "pois"]);
        expect(selected.sql).toContain('lb."layerId" = \'base\'');
        expect(selected.sql).toContain('OR lb."layerId" IN');
        expect(selected.values).toEqual(["release-a", "roads", "pois"]);
        const none = readyLayerSearchFilter("release-a", []);
        expect(none.sql).toContain('lb."layerId" = \'base\'');
        expect(none.sql).not.toContain('OR lb."layerId" IN');
        expect(none.sql).toContain('f.category = ANY(lb."searchCategories")');
      });

      it("rejects pointer races even when a new release has the same layer revision", async () => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValueOnce([{ publishedReleaseId: "release-b" }])
            .mockResolvedValueOnce([{ ...layer, releaseId: "release-b" }]),
          $executeRaw: vi.fn(),
          auditLog: { create: vi.fn() },
        };
        database.$transaction.mockImplementationOnce((callback) => callback(tx));
        await expect(changeMapLayer({
          id: layer.id, enabled: true, expectedRevision: 0,
          expectedReleaseId: "release-a", confirmation: "CHANGE LAYER",
        }, "administrator")).rejects.toThrow("STALE_PUBLISHED_POINTER");
        expect(tx.$executeRaw).not.toHaveBeenCalled();
      });

      it("disables a bound warning layer and audits the actual release policy", async () => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValueOnce([{ publishedReleaseId: layer.releaseId }])
            .mockResolvedValueOnce([{ ...layer, enabled: true, status: "warning" }]),
          $executeRaw: vi.fn(),
          auditLog: { create: vi.fn() },
        };
        database.$transaction.mockImplementationOnce((callback) => callback(tx));
        await expect(changeMapLayer({
          id: layer.id, enabled: false, expectedRevision: 0,
          expectedReleaseId: layer.releaseId, confirmation: "CHANGE LAYER",
        }, "administrator")).resolves.toEqual({ id: layer.id, enabled: false, revision: 1 });
        expect(tx.$executeRaw.mock.calls[0][0].sql).toContain("UPDATE jenan_map.release_layer");
        expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ actorId: "administrator", metadata: expect.objectContaining({ releaseId: layer.releaseId }) }),
        }));
      });

      it("translates serialization conflicts into an explicit manual-retry concurrency code", async () => {
        database.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
          "synthetic serialization conflict", { code: "P2034", clientVersion: "test" },
        ));
        await expect(changeMapLayer({
          id: "roads", enabled: false, expectedRevision: 0, confirmation: "CHANGE LAYER",
        }, "administrator")).rejects.toThrow("CONCURRENT_CHANGE_RETRY");
      });
    });
    it("rejects missing, fabricated or multiply claimed bindings and categories", () => {
      for (const input of [
        [], [{ ...binding, styleLayerIds: [] }], [{ ...binding, styleLayerIds: ["fake"] }],
        [binding, binding], [binding, { ...binding, id: "base" }],
        [{ ...binding, styleLayerIds: ["road-line", "road-line"] }],
        [binding, { id: "pois", styleLayerIds: ["poi-symbol"], searchCategories: ["road"] }],
        [{ ...binding, source: "browser-supplied provenance" }],
      ]) expect(() => validateReleaseLayerBindings(input, ["road-line", "poi-symbol"])).toThrow("INVALID_LAYER_BINDING");
    });
    it("preserves explicitly internal classification instead of promoting it", () => {
      expect(validateReleaseLayerBindings([{ ...binding, visibility: "internal" }], ["road-line"])[0].visibility).toBe("internal");
    });
    it("keeps unmeasured confidence unknown and accepts only bounded measured values", () => {
      expect(validateReleaseLayerBindings([binding], ["road-line"])[0].confidence).toBeNull();
      expect(validateReleaseLayerBindings([{ ...binding, confidence: 0.6 }], ["road-line"])[0].confidence).toBe(0.6);
      expect(() => validateReleaseLayerBindings([{ ...binding, confidence: 2 }], ["road-line"])).toThrow("INVALID_LAYER_BINDING");
    });
  });
  it("permits only an explicitly sourced public layer pinned to the active release", () => {
    expect(() => assertLayerCanEnable(layer, "approved-release")).not.toThrow();
    expect(layer.confidence).toBeNull();
  });
});
