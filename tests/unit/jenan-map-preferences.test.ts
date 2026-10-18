import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), transaction: vi.fn(), audit: vi.fn(), layers: vi.fn(), published: vi.fn(), access: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: { $queryRaw: mocks.query, $transaction: mocks.transaction },
}));
vi.mock("@/services/jenan-map/service", () => ({
  publishedRelease: mocks.published,
}));
vi.mock("@/services/jenan-map/layers", () => ({ releaseMapLayers: mocks.layers }));
vi.mock("@/services/jenan-map/http", () => ({
  access: mocks.access,
  json: (body: unknown, status = 200) => NextResponse.json(body, { status }),
  failure: (error: { code?: string; status?: number }) => NextResponse.json({ error: error.code }, { status: error.status ?? 503 }),
}));

import { mapPreferencesSchema, savedLocationSchema, searchSchema } from "@/services/jenan-map/contracts";
import { mapPreferences, saveMapPreferences } from "@/services/jenan-map/preferences";
import { GET, PUT } from "@/app/api/jenan-map/preferences/route";
import { loadMapPreferences, persistMapPreferences, restoreMapPreferences } from "@/features/jenan-map/preferences-api";

const releaseId = "00000000-0000-4000-8000-000000000001";
const layers = [
  { id: "roads", label: "الطرق", available: true, styleLayerIds: ["road-line"] },
  { id: "internal", label: "داخلي", available: false, styleLayerIds: [] },
];
const settings = { releaseId, radius: 1000, visibleLayers: ["roads"], viewport: null, revision: 1 };
const input = { releaseId, radius: 1000 as const, visibleLayers: ["roads"], viewport: null, expectedRevision: 0 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  mocks.access.mockResolvedValue({ user: { id: "session-user" } });
  mocks.layers.mockResolvedValue(layers.filter((layer) => layer.available));
  mocks.transaction.mockImplementation((callback) => callback({
    $queryRaw: mocks.query, auditLog: { create: mocks.audit },
  }));
});

describe("map preference contracts and client isolation", () => {
  it("parses bounded selected search layers without conflating empty with omitted", () => {
    expect(searchSchema.parse({ q: "حي" }).layerIds).toBeUndefined();
    expect(searchSchema.parse({ q: "حي", layerIds: "" }).layerIds).toEqual([]);
    expect(searchSchema.parse({ q: "حي", layerIds: "roads,pois" }).layerIds).toEqual(["roads", "pois"]);
    expect(searchSchema.safeParse({ q: "حي", layerIds: "roads,roads" }).success).toBe(false);
    expect(searchSchema.safeParse({ q: "حي", layerIds: "../private" }).success).toBe(false);
  });
  it("accepts device-selected saved points across the frontend/server contract", () => {
    expect(savedLocationSchema.parse({
      latitude: 24.7, longitude: 46.6, releaseId, source: "geolocation",
    }).source).toBe("geolocation");
  });
  it.each([
    { ...input, userId: "someone-else" },
    { ...input, radius: 2000 },
    { ...input, visibleLayers: ["roads", "roads"] },
    { ...input, viewport: { latitude: 24, longitude: 46, zoom: Infinity } },
    { ...input, viewport: { latitude: 80, longitude: 46, zoom: 10 } },
  ])("rejects invalid or identity-bearing settings %#", (value) => {
    expect(mapPreferencesSchema.safeParse(value).success).toBe(false);
  });
  it("restores only available style-bound layers, including a deliberate empty selection", () => {
    expect(restoreMapPreferences({ ...settings, visibleLayers: ["roads", "internal"] }, releaseId, layers).visibleLayers).toEqual(["roads"]);
    expect(restoreMapPreferences({ ...settings, visibleLayers: [] }, releaseId, layers).visibleLayers).toEqual([]);
    expect(() => restoreMapPreferences({ ...settings, releaseId: "other" }, releaseId, layers)).toThrow("بالإصدار");
  });
  it("preserves unavailable/empty settings without inventing a persisted record", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ settings: null }))));
    expect(await loadMapPreferences(releaseId, layers)).toBeNull();
  });
  it("writes only settings and the expected revision, never a user identity or draft location", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ settings }))));
    expect(await persistMapPreferences({ ...settings, revision: 0 }, layers)).toEqual(settings);
    expect(fetch).toHaveBeenCalledWith("/api/jenan-map/preferences", expect.objectContaining({
      method: "PUT", credentials: "same-origin", body: JSON.stringify(input),
    }));
  });
});

describe("durable preference ownership and lifecycle", () => {
  it("reads only the authenticated owner's selected release and returns truthful emptiness", async () => {
    mocks.query.mockResolvedValue([]);
    expect(await mapPreferences("owner-a", releaseId)).toBeNull();
    expect(mocks.published).toHaveBeenCalledWith(releaseId);
    const query = mocks.query.mock.calls[0][0];
    expect(query.sql).toContain('"userId" = ?');
    expect(query.values).toEqual(["owner-a", releaseId]);
  });
  it("does not query preferences for an unpublished release", async () => {
    mocks.published.mockRejectedValue(new Error("RELEASE_NOT_PUBLISHED"));
    await expect(mapPreferences("owner", releaseId)).rejects.toThrow("RELEASE_NOT_PUBLISHED");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("blocks unavailable layer selection under the runtime lock before writing", async () => {
    mocks.query.mockResolvedValueOnce([{ status: "enabled", publishedReleaseId: releaseId }]);
    await expect(saveMapPreferences("owner", { ...input, visibleLayers: ["internal"] })).rejects.toMatchObject({ code: "LAYER_DATA_UNAVAILABLE" });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rechecks the runtime pointer under the write lock", async () => {
    mocks.query.mockResolvedValueOnce([{ status: "enabled", publishedReleaseId: "other" }]);
    await expect(saveMapPreferences("owner", input)).rejects.toMatchObject({ code: "RELEASE_NOT_PUBLISHED" });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects stale tabs rather than overwriting another saved revision", async () => {
    mocks.query.mockResolvedValueOnce([{ status: "enabled", publishedReleaseId: releaseId }]).mockResolvedValueOnce([{ revision: 2 }]);
    await expect(saveMapPreferences("owner", { ...input, expectedRevision: 1 })).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it("persists and audits settings for the owner without coordinates in the audit", async () => {
    mocks.query.mockResolvedValueOnce([{ status: "enabled", publishedReleaseId: releaseId }]).mockResolvedValueOnce([]).mockResolvedValueOnce([settings]);
    expect(await saveMapPreferences("owner", input)).toEqual(settings);
    expect(mocks.query.mock.calls[2][0].values.slice(0, 2)).toEqual(["owner", releaseId]);
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorId: "owner", metadata: { releaseId, revision: 1 },
    }) });
  });
});

describe("preference route guard", () => {
  const url = "https://jenanpro.sa/api/jenan-map/preferences";
  const put = (body: string) => new NextRequest(url, { method: "PUT", body });
  it("denies read/write before accessing persistence", async () => {
    mocks.access.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await GET(new NextRequest(`${url}?releaseId=${releaseId}`))).status).toBe(401);
    expect((await PUT(put(JSON.stringify(input)))).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("enforces the mutation origin guard and rejects malformed, oversized or user-scoped input", async () => {
    const request = put("{");
    expect((await PUT(request)).status).toBe(400);
    expect(mocks.access).toHaveBeenCalledWith(request, false, true);
    expect((await PUT(put(" ".repeat(8193)))).status).toBe(413);
    expect((await PUT(put(JSON.stringify({ ...input, userId: "other" })))).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("ignores a query-string identity and scopes reads to the current session", async () => {
    mocks.query.mockResolvedValue([]);
    const response = await GET(new NextRequest(`${url}?releaseId=${releaseId}&userId=other`));
    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls[0][0].values).toEqual(["session-user", releaseId]);
  });
});
