import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), rate: vi.fn(), origin: vi.fn(), overview: vi.fn(), list: vi.fn(), command: vi.fn(), retrieve: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getUser }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: mocks.origin }));
vi.mock("@/lib/rate-limit/route-rate-limit", () => ({ enforceRouteRateLimit: mocks.rate }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/services/data-center/service", () => ({
  getDataCenterOverview: mocks.overview, listDataCenterArea: mocks.list, dispatchDataCenterCommand: mocks.command,
}));
vi.mock("@/services/data-center/imports", () => ({
  DATA_CENTER_UPLOAD_LIMIT: 10 * 1024 * 1024, dataCenterImportCapabilities: () => ({ scanner: { available: false } }),
}));
vi.mock("@/services/data-center/retrieval", () => ({
  retrieveDataCenterContext: mocks.retrieve, dataCenterSemanticStatus: () => ({ available: false }),
}));
import { adminDataCenterGet, adminDataCenterPost, dataCenterContextGet, readDataCenterBody } from "@/lib/admin/data-center-http";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: "admin", systemRole: "ADMIN" });
  mocks.rate.mockResolvedValue(null); mocks.origin.mockReturnValue(true);
  mocks.overview.mockResolvedValue({ sources: 0, items: 0 });
  mocks.list.mockResolvedValue({ rows: [], total: 0, page: 1, limit: 20 });
  mocks.command.mockResolvedValue({ id: "created" });
  mocks.retrieve.mockResolvedValue({ available: true, rows: [], total: 0 });
});
const request = (path = "/api/admin/data-center", body?: unknown) => new NextRequest(`http://localhost${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
describe("Data Center authenticated HTTP boundary", () => {
  it("returns 401 anonymously and 403 for a non-admin management request", async () => {
    mocks.getUser.mockResolvedValueOnce(null);
    expect((await adminDataCenterGet(request())).status).toBe(401);
    mocks.getUser.mockResolvedValueOnce({ id: "u", systemRole: "USER" });
    expect((await adminDataCenterGet(request())).status).toBe(403);
    expect(mocks.overview).not.toHaveBeenCalled();
  });
  it("fails closed on exhausted shared rate limits", async () => {
    mocks.rate.mockResolvedValue(NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 }));
    expect((await adminDataCenterGet(request())).status).toBe(429);
    expect(mocks.overview).not.toHaveBeenCalled();
  });
  it("rejects cross-origin commands and unsupported remote imports", async () => {
    mocks.origin.mockReturnValueOnce(false);
    expect((await adminDataCenterPost(request(undefined, { action: "register-type" }))).status).toBe(403);
    expect((await adminDataCenterPost(request(undefined, { action: "import-url", url: "http://169.254.169.254" }))).status).toBe(400);
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("returns truthful empty overview with no-store and unavailable scanner", async () => {
    const response = await adminDataCenterGet(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ dataCenter: { sources: 0, items: 0 }, capabilities: { imports: { scanner: { available: false } } } });
  });
  it("enforces pagination bounds and dispatches supported actions", async () => {
    expect((await adminDataCenterGet(request("/api/admin/data-center?area=items&limit=10000"))).status).toBe(400);
    const result = await adminDataCenterPost(request(undefined, { action: "register-type", key: "custom-type", label: "Custom", layer: "DATA" }));
    expect(result.status).toBe(201);
    expect(mocks.command).toHaveBeenCalledWith(expect.objectContaining({ action: "register-type", requiresIndependentReview: false }), expect.objectContaining({ id: "admin", kind: "HUMAN" }));
  });
  it("accepts robot grant commands only from administrators and never lets a request choose the actor", async () => {
    const grant = { action: "grant-robot-access", sourceId: "s", robotId: "r", principalId: "p", roleKey: "analyst", specialty: "demography", missionId: "m", reason: "Mission data need", expiresAt: "2030-01-01T00:00:00.000Z" };
    expect((await adminDataCenterPost(request(undefined, grant))).status).toBe(201);
    expect(mocks.command).toHaveBeenCalledWith(expect.objectContaining({ action: "grant-robot-access", access: "READ" }), { id: "admin", systemRole: "ADMIN", kind: "HUMAN" });
    expect((await adminDataCenterPost(request(undefined, { action: "revoke-robot-access", grantId: "g", reason: "Mission ended" }))).status).toBe(200);
    mocks.command.mockClear();
    expect((await adminDataCenterPost(request(undefined, { ...grant, kind: "AI", robotIdentity: { robotId: "r" } }))).status).toBe(400);
    mocks.getUser.mockResolvedValueOnce({ id: "u", systemRole: "USER" });
    expect((await adminDataCenterPost(request(undefined, grant))).status).toBe(403);
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("bounds streamed bodies even when content-length is absent", async () => {
    const streamed = new NextRequest("http://localhost/api/admin/data-center", { method: "POST", body: "too long" });
    await expect(readDataCenterBody(streamed, 2)).rejects.toThrow("BODY_TOO_LARGE");
  });
  it("authenticates unified retrieval without promoting the viewer to admin", async () => {
    mocks.getUser.mockResolvedValue({ id: "u", systemRole: "USER" });
    const response = await dataCenterContextGet(request("/api/data-center/context?specialty=finance&missionContext=planning&limit=5"));
    expect(response.status).toBe(200);
    expect(mocks.retrieve).toHaveBeenCalledWith(expect.objectContaining({ specialty: "finance", missionContext: "planning", limit: 5 }), { id: "u", systemRole: "USER", kind: "HUMAN" });
  });
});
