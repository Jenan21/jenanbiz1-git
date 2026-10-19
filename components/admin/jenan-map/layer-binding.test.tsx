import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapLayerBinding, prepareLayerBinding } from "./layer-binding";

function data() {
  const form = new FormData();
  form.set("releaseId", "38b29b7a-4807-45ef-bf4e-9204b4987400");
  form.set("confirmation", "BIND MAP LAYERS");
  form.set("acknowledged", "on");
  form.set("layersJson", JSON.stringify([
    { id: "base", styleLayerIds: ["background", "city-label"], searchCategories: ["city", "address"], visibility: "public" },
  ]));
  return form;
}

describe("durable administrative layer binding form", () => {
  it("sends the exact separate binding endpoint contract without binary-upload metadata", () => {
    const request = prepareLayerBinding(data());
    expect(request.releaseId).toBe("38b29b7a-4807-45ef-bf4e-9204b4987400");
    expect(JSON.parse(request.body)).toEqual({
      layers: [{ id: "base", styleLayerIds: ["background", "city-label"], searchCategories: ["city", "address"], visibility: "public" }],
      confirmation: "BIND MAP LAYERS",
    });
  });

  it("requires explicit public classification, real IDs and confirmation without silently widening internal data", () => {
    for (const value of [
      "not JSON", "[]",
      JSON.stringify([{ id: "base", styleLayerIds: ["background"] }]),
      JSON.stringify([{ id: "base", styleLayerIds: ["background"], visibility: "internal" }]),
      JSON.stringify([{ id: "base", styleLayerIds: [], visibility: "public" }]),
    ]) {
      const form = data();
      form.set("layersJson", value);
      expect(() => prepareLayerBinding(form)).toThrow();
    }
    for (const key of ["confirmation", "acknowledged"]) {
      const form = data();
      form.delete(key);
      expect(() => prepareLayerBinding(form)).toThrow();
    }
  });

  it("disables the entire form while server capabilities and candidate releases are unavailable", () => {
    const html = renderToStaticMarkup(<MapLayerBinding snapshot={null} disabled={false} onSettled={async () => undefined} />);
    expect(html).toContain("ربط الطبقات غير متاح من الخادم");
    expect(html).toContain("<fieldset disabled");
    expect(html).toContain('pattern="BIND MAP LAYERS"');
    expect(html).toContain("غير قابل للاستبدال");
  });
});
