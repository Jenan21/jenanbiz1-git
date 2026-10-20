import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), audit: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query, $transaction: mocks.transaction } }));
vi.mock("@/services/jenan-map/service", () => ({ audit: mocks.audit }));
vi.mock("@/services/jenan-map/http", () => ({
  access: mocks.access,
  json: (body: unknown, status = 200) => NextResponse.json(body, { status }),
  failure: (error: { code?: string; status?: number }) => NextResponse.json({ error: error.code }, { status: error.status ?? 503 }),
}));

import { GET } from "@/app/api/admin/jenan-map/releases/[releaseId]/layers/export/route";
import { csvRecords } from "./jenan-map-csv";

const releaseId = "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1";
const provenance = { license: "ODbL-1.0", attribution: "© OpenStreetMap contributors (ODbL 1.0; https://www.openstreetmap.org/copyright)", source: "Protomaps basemap build 20261017" };
const rows = [
  { id: "f1", label: "حي النرجس", category: "neighbourhood", layerId: "places", sourceId: "node/1", aliases: ["Narjis"], latitude: 24.8216, longitude: 46.6633, geometry: { type: "Point", coordinates: [46.6633, 24.8216] } },
  { id: "f2", label: "طريق الملك فهد", category: "road", layerId: "places", sourceId: "way/2", aliases: null, latitude: 24.7, longitude: 46.7, geometry: { type: "Point", coordinates: [46.7, 24.7] } },
];
const download = (format: string) => GET(
  new NextRequest(`http://localhost/api/admin/jenan-map/releases/${releaseId}/layers/export?layerId=places&format=${format}`),
  { params: Promise.resolve({ releaseId }) },
);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ user: { id: "admin-1" } });
  mocks.transaction.mockImplementation((callback) => callback({}));
});

describe("a layer download carries its source, licence and attribution in every text format", () => {
  it("CSV: columns on every row, a byte order mark for Arabic, and the audit record", async () => {
    mocks.query.mockResolvedValueOnce([{ provenance, status: "ready" }]).mockResolvedValueOnce(rows);
    const response = await download("csv");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="jenan-pro-map-places.csv"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    expect([...bytes.subarray(0, 3)], "UTF-8 byte order mark").toEqual([0xef, 0xbb, 0xbf]);
    const records = csvRecords(await response.text());
    expect(records.map((record) => record.id)).toEqual(["f1", "f2"]);
    for (const record of records) {
      expect(record).toMatchObject({
        release_id: releaseId, provenance_license: "ODbL-1.0", provenance_ownership: "OPEN_LICENSE",
        provenance_attribution: provenance.attribution, provenance_source: provenance.source,
      });
      expect(Date.parse(record.generated_at)).not.toBeNaN();
    }
    expect(mocks.audit).toHaveBeenCalledWith({}, "admin-1", "export.features", releaseId, { layerId: "places", format: "csv", count: 2 });
  });

  it.each(["json", "geojson"])("%s: the same provenance in the file itself", async (format) => {
    mocks.query.mockResolvedValueOnce([{ provenance, status: "ready" }]).mockResolvedValueOnce(rows);
    const body = await (await download(format)).json();
    expect(format === "json" ? body : body.properties).toMatchObject({
      releaseId, license: "ODbL-1.0", ownership: "OPEN_LICENSE", attribution: provenance.attribution, source: provenance.source,
    });
  });

  it("refuses a layer whose licence does not allow redistribution, without sending any data", async () => {
    mocks.query.mockResolvedValueOnce([{ provenance: null, status: "ready" }]);
    const response = await download("csv");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "EXPORT_LICENSE_PERMISSION_REQUIRED" });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
