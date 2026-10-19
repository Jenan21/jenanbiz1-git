import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), manifest: vi.fn(), snapshot: vi.fn(), overviewFacts: vi.fn(), mapLayers: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/authorization", () => ({ hasPlatformAdminAccess: vi.fn() }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: vi.fn() }));
vi.mock("@/lib/rate-limit/route-rate-limit", () => ({ enforceRouteRateLimit: vi.fn() }));
vi.mock("@/services/jenan-map/service", () => ({
  manifest: mocks.manifest, snapshot: mocks.snapshot, overviewFacts: mocks.overviewFacts, command: vi.fn(), preverifyCommand: vi.fn(),
  authorizedArtifact: vi.fn(), authorizedReleaseAsset: vi.fn(), servedStyle: vi.fn(),
}));
vi.mock("@/services/jenan-map/layers", () => ({ mapLayers: mocks.mapLayers, changeMapLayer: vi.fn(), layerChangeSchema: { safeParse: vi.fn() } }));
vi.mock("@/services/jenan-map/http", async (original) => ({ ...(await original<typeof import("@/services/jenan-map/http")>()), access: mocks.access }));

import { MapError } from "@/services/jenan-map/contracts";
import { GET as memberManifest } from "@/app/api/jenan-map/route";
import { GET as adminOverview } from "@/app/api/admin/jenan-map/route";
import { GET as adminLayers } from "@/app/api/admin/jenan-map/layers/route";

// These three handlers answer a truthful "unavailable" instead of an error page, so the screens can say what is wrong. The answer stays exactly as it
// is; what changed is that an unexpected failure behind it is no longer swallowed: it reaches the server log, and never the client.
const request = () => new NextRequest("http://localhost/api/jenan-map");
const handlers = [
  ["the member's map manifest", memberManifest, mocks.manifest, { status: "unavailable", release: null, reason: "MAP_NOT_PROVISIONED_OR_UNAVAILABLE" }],
  ["the administrator's overview", adminOverview, mocks.snapshot, { available: false, blockers: ["MAP_NOT_PROVISIONED_OR_UNAVAILABLE"] }],
  ["the administrator's layer catalog", adminLayers, mocks.mapLayers, { layers: null, available: false, error: "MAP_UNAVAILABLE" }],
] as const;

describe("an unavailable answer still tells the operator why", () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.resetAllMocks();
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.access.mockResolvedValue({ user: { id: "admin-1" } });
  });

  it.each(handlers)("%s: an unexpected failure is logged, and the answer and its text are unchanged", async (_name, handler, service, answer) => {
    const cause = new Error("connect ECONNREFUSED 10.0.0.7:5432 password=hunter2");
    service.mockRejectedValue(cause);
    const response = await handler(request());
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject(answer);
    expect(text, "nothing about the cause reaches the client").not.toMatch(/ECONNREFUSED|hunter2|10\.0\.0\.7/);
    expect(log).toHaveBeenCalledExactlyOnceWith("jenan-map request failed", cause);
  });

  it.each(handlers)("%s: a coded, expected outcome gives the same answer without a log entry", async (_name, handler, service, answer) => {
    service.mockRejectedValue(new MapError("RELEASE_NOT_PUBLISHED", 409));
    const response = await handler(request());
    expect(JSON.parse(await response.text())).toMatchObject(answer);
    expect(log).not.toHaveBeenCalled();
  });

  it("the member's manifest also logs a failure of the sign-in check itself", async () => {
    const cause = new Error("session store unreachable");
    mocks.access.mockRejectedValue(cause);
    const response = await memberManifest(request());
    expect(await response.json()).toEqual({ status: "unavailable", release: null, reason: "MAP_NOT_PROVISIONED_OR_UNAVAILABLE" });
    expect(log).toHaveBeenCalledExactlyOnceWith("jenan-map request failed", cause);
  });

  it("a refused request (not signed in, not an administrator) is answered as before and is not an error", async () => {
    const refusal = new Response(JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }), { status: 401 });
    mocks.access.mockResolvedValue({ response: refusal });
    for (const [, handler] of handlers) expect((await handler(request())).status).toBe(401);
    expect(log).not.toHaveBeenCalled();
  });

  it("the layer catalog keeps its outer handler: a failure of the sign-in check is answered and logged by failure()", async () => {
    const cause = new Error("auth backend down");
    mocks.access.mockRejectedValue(cause);
    const response = await adminLayers(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "MAP_UNAVAILABLE" });
    expect(log).toHaveBeenCalledExactlyOnceWith("jenan-map request failed", cause);
  });
});
