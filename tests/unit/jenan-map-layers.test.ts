import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const database = vi.hoisted(() => ({
  $queryRaw: vi.fn(), $executeRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: database }));

import { assertLayerCanEnable, assertPublicStyleLayerBindings, bindReleaseLayers, changeMapLayer, layerChangeSchema, layerProvenanceProblems, mapLayers, readyLayerSearchFilter, releaseManifestLayers, releaseMapLayers, validateReleaseLayerBindings, type StoredMapLayer } from "@/services/jenan-map/layers";

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
  it("rejects internal and unbound renderer IDs in a public style rather than pretending visibility is authorization", () => {
    expect(() => assertPublicStyleLayerBindings([{ visibility: "internal", styleLayerIds: ["secret"] }], ["secret"])).toThrow("INTERNAL_LAYER_NOT_PUBLIC");
    expect(() => assertPublicStyleLayerBindings([{ visibility: "public", styleLayerIds: ["road"] }], ["road", "secret"])).toThrow("UNBOUND_PUBLIC_STYLE_LAYER");
    expect(() => assertPublicStyleLayerBindings([{ visibility: "public", styleLayerIds: ["road"] }], ["road"])).not.toThrow();
  });
  it("never enables missing, stale or internal data", () => {
    for (const change of [
      { status: "unavailable" as const }, { source: null }, { version: null },
      { releaseId: "other-release" }, { visibility: "internal" as const }, { styleLayerIds: [] },
    ]) expect(() => assertLayerCanEnable({ ...layer, ...change }, "approved-release")).toThrow();
    expect(() => assertLayerCanEnable(layer, null)).toThrow();
  });

  it("never persists an internal binding for public archive/style preparation", async () => {
    await expect(bindReleaseLayers(database, "release-a", [
      { id: "roads", styleLayerIds: ["private-road"], visibility: "internal" },
    ], ["private-road"])).rejects.toThrow("INTERNAL_LAYER_NOT_PUBLIC");
    expect(database.$queryRaw).not.toHaveBeenCalled();
    expect(database.$executeRaw).not.toHaveBeenCalled();
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
        database.$queryRaw.mockResolvedValueOnce([{ publishedReleaseId: "release-b" }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
        await mapLayers();
        expect(database.$queryRaw.mock.calls[1][0].values).toContain("release-b");
        expect(database.$queryRaw.mock.calls[1][0].sql).toContain("LEFT JOIN jenan_map.release_layer");
      });

      it("offers a data export only for a bound layer that holds features and has a redistributable licence", async () => {
        const open = { license: "ODbL-1.0" };
        database.$queryRaw
          .mockResolvedValueOnce([{ publishedReleaseId: "release-b" }])
          .mockResolvedValueOnce([
            { ...layer, id: "places", releaseId: "release-b", provenance: open },
            { ...layer, id: "base", releaseId: "release-b", provenance: open },
            { ...layer, id: "pois", releaseId: "release-b", provenance: { license: "" } },
            { ...layer, id: "roads", releaseId: "release-b", provenance: null },
            { ...layer, id: "buildings", releaseId: null, provenance: null },
          ])
          .mockResolvedValueOnce([{ layerId: "places", n: 16010 }, { layerId: "pois", n: 3883 }, { layerId: "roads", n: 35028 }]);
        const result = await mapLayers();
        expect(result.map(({ id, featureCount, exportable }) => ({ id, featureCount, exportable }))).toEqual([
          { id: "places", featureCount: 16010, exportable: true },
          { id: "base", featureCount: 0, exportable: false },
          { id: "pois", featureCount: 3883, exportable: false },
          { id: "roads", featureCount: 35028, exportable: false },
          { id: "buildings", featureCount: 0, exportable: false },
        ]);
        expect(database.$queryRaw.mock.calls[2][0].sql).toContain("FROM jenan_map.feature");
        expect(database.$queryRaw.mock.calls[2][0].values).toContain("release-b");
      });

      it("does not count features when nothing is published", async () => {
        database.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...layer, releaseId: null }]);
        expect(await mapLayers()).toEqual([expect.objectContaining({ featureCount: 0, exportable: false })]);
        expect(database.$queryRaw).toHaveBeenCalledTimes(2);
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

describe("open-data coverage must list the provenance of every dataset the release holds", () => {
  const provenance = { source: "OSM", organization: "OpenStreetMap contributors", url: "https://www.openstreetmap.org", sourceDate: "2026-10-01T00:00:00.000Z", importedAt: "2026-10-02T00:00:00.000Z", license: "ODbL-1.0", attribution: "© OpenStreetMap contributors" };
  const other = { ...provenance, source: "geoBoundaries", license: "CC-BY-4.0" };
  const coverage = [{ id: "base", provenance }, { id: "roads", provenance }, { id: "regions", provenance: other }, { id: "governorates", provenance: other }];
  const bound = [
    { id: "base", provenance, searchCategories: [] as string[] },
    { id: "roads", provenance, searchCategories: ["roads"] },
    { id: "regions", provenance: other, searchCategories: ["regions"] },
  ];
  const held = new Set(["roads", "regions", "governorates"]);
  const categories = new Set(["roads", "regions", "governorates"]);

  it("accepts bound layers, a data-only layer such as governorates, and tile-only layers without search categories", () => {
    expect(layerProvenanceProblems(coverage, bound, held, categories)).toEqual([]);
  });
  it("refuses a bound layer whose provenance differs from the reviewed one", () => {
    const changed = bound.map((b) => b.id === "roads" ? { ...b, provenance: { ...provenance, license: "CC-BY-4.0" } } : b);
    expect(layerProvenanceProblems(coverage, changed, held, categories)).toEqual(["roads: provenance differs"]);
  });
  it("refuses an imported layer with no reviewed provenance, and provenance for a layer the release does not hold", () => {
    expect(layerProvenanceProblems(coverage.filter((c) => c.id !== "governorates"), bound, held, categories)).toEqual(["governorates: imported layer has no reviewed provenance"]);
    expect(layerProvenanceProblems([...coverage, { id: "pois", provenance }], bound, held, categories)).toEqual(["pois: provenance for a layer the release does not contain"]);
  });
  it("requires a layer to be searchable by its own category exactly when the release has features of it", () => {
    expect(layerProvenanceProblems(coverage, bound.map((b) => b.id === "roads" ? { ...b, searchCategories: [] } : b), held, categories)).toEqual(["roads: search categories"]);
    expect(layerProvenanceProblems(coverage, bound.map((b) => b.id === "base" ? { ...b, searchCategories: ["base"] } : b), held, categories)).toEqual(["base: search categories"]);
  });
  it("refuses a binding with no stored provenance and malformed coverage", () => {
    expect(layerProvenanceProblems(coverage, bound.map((b) => b.id === "base" ? { id: "base", searchCategories: [] } : b), held, categories)).toEqual(["base: provenance missing"]);
    expect(layerProvenanceProblems(undefined, bound, held, categories)).toEqual(["coverage: layers missing"]);
    expect(layerProvenanceProblems([{ id: "base", provenance: { source: "x" } }, ...coverage.slice(1)], bound, held, categories)).toEqual(["base: reviewed provenance invalid"]);
  });
});