import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), rate: vi.fn(), origin: vi.fn(), overview: vi.fn(),
  db: {
    user: { count: vi.fn() }, organization: { count: vi.fn() }, robot: { count: vi.fn() }, robotTask: { count: vi.fn() },
    sharedKnowledge: { count: vi.fn() }, learningLog: { count: vi.fn() }, evidence: { count: vi.fn() },
    modelExecution: { count: vi.fn() }, costRecord: { count: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getUser }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: mocks.origin }));
vi.mock("@/lib/rate-limit/route-rate-limit", () => ({ enforceRouteRateLimit: mocks.rate }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/services/data-center/service", () => ({ getDataCenterOverview: mocks.overview }));
vi.mock("@/services/data-center/imports", () => ({
  DATA_CENTER_UPLOAD_LIMIT: 10 * 1024 * 1024, dataCenterImportCapabilities: () => ({ scanner: { available: false } }),
}));
vi.mock("@/services/data-center/retrieval", () => ({ dataCenterSemanticStatus: () => ({ available: false }) }));
import { GET, POST } from "@/app/api/admin/data-center/route";

const counts = { user: 7, organization: 3, robot: 0, robotTask: 12, sharedKnowledge: 5, learningLog: 0, evidence: 2, modelExecution: 40, costRecord: 9 };
const request = (query = "", init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://localhost/api/admin/data-center${query}`, init);
const post = () => request("", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "register-type" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: "admin", systemRole: "ADMIN" });
  mocks.rate.mockResolvedValue(null);
  mocks.origin.mockReturnValue(true);
  mocks.overview.mockResolvedValue({ sources: 0, items: 0 });
  for (const [name, value] of Object.entries(counts)) mocks.db[name as keyof typeof mocks.db].count.mockResolvedValue(value);
});

describe("/api/admin/data-center keeps the administration contract and serves only measured platform metrics", () => {
  it("answers 403, like every other administration API, to a caller without a session", async () => {
    mocks.getUser.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false, message: "Admin access required" });
    expect((await POST(post())).status).toBe(403);
    expect(mocks.overview).not.toHaveBeenCalled();
  });

  it("answers 403 to a signed-in caller who is not an administrator", async () => {
    mocks.getUser.mockResolvedValue({ id: "user", systemRole: "USER" });
    expect((await GET(request("?area=platform"))).status).toBe(403);
    expect(mocks.db.user.count).not.toHaveBeenCalled();
  });

  it("serves the Data Center overview to an administrator with the success contract", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, dataCenter: { sources: 0, items: 0 } });
  });

  it("serves real database counts for Platform Metrics, keeps zero as zero, and is never cached", async () => {
    const response = await GET(request("?area=platform"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const { success, platform } = await response.json();
    expect(success).toBe(true);
    expect(platform.counts).toEqual({
      users: 7, organizations: 3, robots: 0, tasks: 12, sharedKnowledge: 5, learningLog: 0, verifiedEvidence: 2, modelExecutions: 40, costRecords: 9,
    });
    expect(Number.isFinite(Date.parse(platform.measuredAt))).toBe(true);
    expect(mocks.db.evidence.count).toHaveBeenCalledWith({ where: { verified: true } });
    expect(mocks.db.user.count).toHaveBeenCalledWith();
  });

  it("never turns a count that failed into zero", async () => {
    mocks.db.costRecord.count.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(request("?area=platform"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ success: false, message: "DATA_CENTER_UNAVAILABLE" });
  });

  it("carries no health, skill, score or percentage figure", async () => {
    const text = JSON.stringify(await (await GET(request("?area=platform"))).json());
    expect(text).not.toMatch(/health|skill|score|average|percent|%/i);
  });

  it("passes statuses other than the anonymous 401 through unchanged", async () => {
    mocks.rate.mockResolvedValueOnce(NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 }));
    expect((await GET(request("?area=platform"))).status).toBe(429);
    expect(mocks.db.user.count).not.toHaveBeenCalled();
  });
});
