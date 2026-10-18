import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { canChangeLayer, MapLayerCatalog, type AdminMapLayer } from "./layer-catalog";

const layer: AdminMapLayer = {
  id: "roads", label: "الطرق", status: "unavailable", enabled: false, visibility: "internal",
  releaseId: null, source: null, version: null, confidence: null, updatedAt: null, revision: 0,
  styleLayerIds: [], searchCategories: [], sourceDate: null, license: null,
};

describe("admin layer catalog controls", () => {
  it("fails closed for unavailable, warning, internal, unbound and stale-release layers", () => {
    expect(canChangeLayer(layer, null)).toBe(false);
    const ready = { ...layer, status: "ready" as const, styleLayerIds: ["roads-line"], releaseId: "active", source: "synthetic fixture", version: "test-only", visibility: "public" as const };
    expect(canChangeLayer(ready, "active")).toBe(true);
    expect(canChangeLayer(ready, "other")).toBe(false);
    expect(canChangeLayer({ ...ready, visibility: "internal" }, "active")).toBe(false);
    expect(canChangeLayer({ ...ready, source: null }, "active")).toBe(false);
    expect(canChangeLayer({ ...ready, status: "warning" }, "active")).toBe(false);
    expect(canChangeLayer({ ...ready, styleLayerIds: [] }, "active")).toBe(false);
  });

  it("allows disabling a ready enabled layer without falsely enabling missing data", () => {
    expect(canChangeLayer({ ...layer, status: "ready", enabled: true }, null)).toBe(true);
    expect(canChangeLayer({ ...layer, enabled: true }, null)).toBe(true);
  });

  it("renders an unknown catalog without fabricated layer records or enabled controls", () => {
    const html = renderToStaticMarkup(<MapLayerCatalog activeReleaseId={null} />);
    expect(html).toContain("جارٍ قراءة الحالة");
    expect(html).not.toContain("14");
    expect(html).not.toContain("100%");
    expect(html).toContain("disabled");
  });
});
