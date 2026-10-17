import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { assertLayerCanEnable, layerChangeSchema, type StoredMapLayer } from "@/services/jenan-map/layers";

const layer: StoredMapLayer = {
  id: "population", label: "السكان", enabled: false, visibility: "public",
  status: "ready", releaseId: "approved-release", source: "licensed-source",
  version: "dated-version", confidence: null, updatedAt: null, revision: 0,
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
      { releaseId: "other-release" }, { visibility: "internal" as const },
    ]) expect(() => assertLayerCanEnable({ ...layer, ...change }, "approved-release")).toThrow();
    expect(() => assertLayerCanEnable(layer, null)).toThrow();
  });
  it("permits only an explicitly sourced public layer pinned to the active release", () => {
    expect(() => assertLayerCanEnable(layer, "approved-release")).not.toThrow();
    expect(layer.confidence).toBeNull();
  });
});
