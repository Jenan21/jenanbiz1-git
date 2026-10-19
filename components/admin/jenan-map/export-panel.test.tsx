import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EXPORT_FORMATS, LayerExportTable, layerExportUrl, MapExportPanel, readExportLayers } from "./export-panel";

const release = "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1";

describe("admin layer data export", () => {
  it("builds the download address of a layer in each supported format", () => {
    expect(EXPORT_FORMATS.map(([format]) => format)).toEqual(["geojson", "json", "csv", "gpkg"]);
    expect(layerExportUrl(release, "real-estate", "gpkg")).toBe(`/api/admin/jenan-map/releases/${release}/layers/export?layerId=real-estate&format=gpkg`);
    expect(layerExportUrl("a/b", "x&y", "csv")).toBe("/api/admin/jenan-map/releases/a%2Fb/layers/export?layerId=x%26y&format=csv");
  });

  it("keeps only layers of a release that hold features, and trusts the server about the licence", () => {
    expect(readExportLayers(null)).toBeNull();
    expect(readExportLayers({ layers: null })).toBeNull();
    expect(readExportLayers({ layers: [
      { id: "places", label: "الأماكن", releaseId: release, source: "OSM", license: "ODbL-1.0", featureCount: 16010, exportable: true },
      { id: "base", label: "الخريطة الأساسية", releaseId: release, featureCount: 0, exportable: false },
      { id: "roads", label: "الطرق", releaseId: null, featureCount: 5, exportable: true },
      { id: "pois", label: "المواقع", releaseId: release, source: null, license: null, featureCount: 3883, exportable: "yes" },
      null,
    ] })).toEqual([
      { id: "places", label: "الأماكن", releaseId: release, source: "OSM", license: "ODbL-1.0", featureCount: 16010, exportable: true },
      { id: "pois", label: "المواقع", releaseId: release, source: null, license: null, featureCount: 3883, exportable: false },
    ]);
  });

  it("offers every format as a download only where the licence allows it, and says why otherwise", () => {
    const html = renderToStaticMarkup(<LayerExportTable layers={[
      { id: "places", label: "الأماكن", releaseId: release, source: "OSM", license: "ODbL-1.0", featureCount: 16010, exportable: true },
      { id: "pois", label: "المواقع", releaseId: release, source: null, license: null, featureCount: 3883, exportable: false },
    ]} />);
    // The address is HTML-escaped inside the attribute, so `&` appears as `&amp;`.
    expect(html).toContain(`href="${layerExportUrl(release, "places", "gpkg").replaceAll("&", "&amp;")}"`);
    for (const [, label] of EXPORT_FORMATS) expect(html).toContain(`>${label}</a>`);
    expect(html.match(/<a /g)).toHaveLength(4);
    expect(html).toContain("16,010");
    expect(html).toContain("غير موثق");
    expect(html).toContain("غير متاح: الترخيص غير موثق أو لا يسمح بإعادة التوزيع");
  });

  it("states that nothing can be exported instead of showing an empty table", () => {
    expect(renderToStaticMarkup(<LayerExportTable layers={[]} />)).toContain("لا توجد طبقات ببيانات قابلة للتصدير في الإصدار المنشور.");
  });

  it("renders an unread list as unknown, with no fabricated layers or links", () => {
    const html = renderToStaticMarkup(<MapExportPanel activeReleaseId={null} />);
    expect(html).toContain("جارٍ قراءة الحالة");
    expect(html).not.toContain("<a ");
    expect(html).toContain("disabled");
  });
});
