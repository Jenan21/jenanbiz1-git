import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  change: vi.fn(),
  list: vi.fn(),
  logUnexpected: vi.fn(),
}));

vi.mock("@/services/jenan-map/http", () => ({
  access: mocks.access,
  json: (body: unknown, status = 200) => NextResponse.json(body, { status }),
  failure: (error: { status?: number }) => NextResponse.json({ error: "FAILED" }, { status: error.status ?? 503 }),
  logUnexpected: mocks.logUnexpected,
}));
vi.mock("@/services/jenan-map/layers", async (original) => {
  const actual = await original<typeof import("@/services/jenan-map/layers")>();
  return { ...actual, changeMapLayer: mocks.change, mapLayers: mocks.list };
});
vi.mock("@/lib/db", () => ({ db: {} }));

import { GET, POST } from "@/app/api/admin/jenan-map/layers/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ user: { id: "session-administrator" } });
  mocks.change.mockResolvedValue({ enabled: false });
  mocks.list.mockResolvedValue([]);
});

function request(body: string) {
  return new NextRequest("https://jenanpro.sa/api/admin/jenan-map/layers", {
    method: "POST", headers: { "content-type": "application/json" }, body,
  });
}

it("denies read and mutation before accessing layer data", async () => {
  mocks.access.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });
  expect((await GET(new NextRequest("https://jenanpro.sa/api/admin/jenan-map/layers"))).status).toBe(403);
  expect((await POST(request("{}"))).status).toBe(403);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.change).not.toHaveBeenCalled();
});

it("returns the stored layer catalog when provisioned", async () => {
  const layers = [{ id: "roads", enabled: false, status: "unavailable" }];
  mocks.list.mockResolvedValue(layers);
  const response = await GET(new NextRequest("https://jenanpro.sa/api/admin/jenan-map/layers"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ layers });
  expect(mocks.access).toHaveBeenCalledWith(expect.any(NextRequest), true);
});

it("reports an unavailable optional catalog without exposing database errors or an empty success", async () => {
  const cause = new Error('relation "jenan_map.runtime" does not exist');
  mocks.list.mockRejectedValue(cause);
  const response = await GET(new NextRequest("https://jenanpro.sa/api/admin/jenan-map/layers"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ layers: null, available: false, error: "MAP_UNAVAILABLE" });
  // The operator is told why in the server log, the screen is not.
  expect(mocks.logUnexpected).toHaveBeenCalledExactlyOnceWith(cause);
});

it("does not treat access failures as catalog availability responses", async () => {
  mocks.access.mockRejectedValue(new Error("session lookup unavailable"));
  const response = await GET(new NextRequest("https://jenanpro.sa/api/admin/jenan-map/layers"));
  expect(response.status).toBe(503);
  expect(mocks.list).not.toHaveBeenCalled();
});

it("enforces administrator mutation/origin access and derives actor only from the session", async () => {
  const req = request(JSON.stringify({
    id: "roads", enabled: false, expectedRevision: 0, confirmation: "CHANGE LAYER",
  }));
  expect((await POST(req)).status).toBe(200);
  expect(mocks.access).toHaveBeenCalledWith(req, true, true);
  expect(mocks.change).toHaveBeenCalledWith(expect.objectContaining({ id: "roads" }), "session-administrator");
});

it("rejects oversized, malformed and caller-identity payloads without mutation", async () => {
  expect((await POST(request(" ".repeat(2049)))).status).toBe(413);
  expect((await POST(request("{"))).status).toBe(400);
  expect((await POST(request(JSON.stringify({
    id: "roads", enabled: false, expectedRevision: 0, confirmation: "CHANGE LAYER",
    actorId: "another-user",
  })))).status).toBe(400);
  expect(mocks.change).not.toHaveBeenCalled();
});
