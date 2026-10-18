import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildReport } from "@/lib/projects/analysis-report";
import { readStudy } from "@/lib/projects/analysis-study";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  buildLiveReport: vi.fn(),
  getSavedAnalysisReport: vi.fn(),
  saveAnalysisReportCopy: vi.fn(),
  getProjectAnalysisStatus: vi.fn(),
}));

const provider = new MemoryRateLimitProvider();

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: () => true }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/rate-limit/auth-rate-limit", () => ({ getRateLimitProvider: () => provider }));
vi.mock("@/services/projects/analysis-report-service", () => ({
  buildLiveReport: mocks.buildLiveReport,
  getSavedAnalysisReport: mocks.getSavedAnalysisReport,
  saveAnalysisReportCopy: mocks.saveAnalysisReportCopy,
}));
vi.mock("@/services/projects/project-analysis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/projects/project-analysis")>()),
  getProjectAnalysisStatus: mocks.getProjectAnalysisStatus,
}));

import { GET as getAnalysisPdf } from "@/app/api/projects/[projectId]/analysis-report/route";
import { GET as getStatus } from "@/app/api/projects/[projectId]/analysis-status/route";
import { POST as postProjects } from "@/app/api/projects/route";
import { GET as getSavedPdf } from "@/app/api/user/reports/[id]/pdf/route";

const projectId = "ckprojectaaaaaaaaaaaaaaaaa";
const now = "2026-10-17T08:00:00.000Z";
const data = {
  project: { id: projectId, name: "Coffee", sector: "Food", countryCode: "SA" },
  study: readStudy({
    status: "COMPLETED",
    updatedAt: now,
    input: { idea: "منصة توصيل قهوة مختصة للمكاتب والشركات", city: "الرياض", targetAudience: "BUSINESSES", latitude: 24.8216, longitude: 46.6633, expectedCapital: 500000 },
    result: { generatedAt: now, evidenceCompleteness: 85, competitionLevel: "LOW", purchasingPowerLevel: "HIGH", dataRiskLevel: "LOW", competitorCount: 1, sourceCount: 1, limitationCount: 0, recommendations: ["VALIDATE_MARKET_DEMAND"] },
  }),
  snapshot: undefined,
};

const get = (path: string) => new Request(`http://localhost${path}`, { headers: { "x-real-ip": "192.0.2.60" } });
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const command = (body: unknown) => new NextRequest("http://localhost/api/projects", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-real-ip": "192.0.2.61" } });

beforeEach(() => {
  provider.clear();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.user = { id: "user-1" };
  mocks.buildLiveReport.mockResolvedValue({ data, model: buildReport(data, "ar") });
  mocks.getSavedAnalysisReport.mockResolvedValue({ id: "ckreportaaaaaaaaaaaaaaaaaa", locale: "ar", title: "x", savedAt: now, data });
  mocks.saveAnalysisReportCopy.mockResolvedValue({ id: "ckreportaaaaaaaaaaaaaaaaaa", savedAt: now });
  mocks.getProjectAnalysisStatus.mockResolvedValue({ status: "PROCESSING", stage: "COMPETITION" });
});

describe("analysis report PDF route", () => {
  it("sends the letterhead PDF as a private download, or inline for printing", async () => {
    const download = await getAnalysisPdf(get(`/api/projects/${projectId}/analysis-report?locale=ar`), ctx({ projectId }));
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");
    expect(download.headers.get("content-disposition")).toMatch(/^attachment; filename="jenan-pro-analysis-/);
    expect(download.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await download.arrayBuffer()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const inline = await getAnalysisPdf(get(`/api/projects/${projectId}/analysis-report?locale=en&disposition=inline`), ctx({ projectId }));
    expect(inline.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(mocks.buildLiveReport).toHaveBeenLastCalledWith(projectId, "user-1", "en");
  });

  it("refuses an anonymous caller, an invalid option, an unknown project and an unfinished analysis", async () => {
    mocks.user = null;
    expect((await getAnalysisPdf(get(`/api/projects/${projectId}/analysis-report`), ctx({ projectId }))).status).toBe(401);
    mocks.user = { id: "user-1" };
    expect((await getAnalysisPdf(get(`/api/projects/${projectId}/analysis-report?locale=fr`), ctx({ projectId }))).status).toBe(400);
    expect((await getAnalysisPdf(get(`/api/projects/${projectId}/analysis-report?disposition=exec`), ctx({ projectId }))).status).toBe(400);
    mocks.buildLiveReport.mockResolvedValueOnce(null);
    expect((await getAnalysisPdf(get(`/api/projects/${projectId}/analysis-report`), ctx({ projectId }))).status).toBe(404);
    const partial = { ...data, study: readStudy({ status: "PENDING", input: data.study.input }) };
    mocks.buildLiveReport.mockResolvedValueOnce({ data: partial, model: buildReport(partial, "ar") });
    expect((await getAnalysisPdf(get(`/api/projects/${projectId}/analysis-report`), ctx({ projectId }))).status).toBe(409);
  });

  it("allows twenty a minute per user and then answers 429", async () => {
    for (let index = 0; index < 20; index += 1) {
      mocks.buildLiveReport.mockResolvedValueOnce(null);
      expect((await getAnalysisPdf(get(`/api/projects/${projectId}/analysis-report`), ctx({ projectId }))).status).toBe(404);
    }
    expect((await getAnalysisPdf(get(`/api/projects/${projectId}/analysis-report`), ctx({ projectId }))).status).toBe(429);
  });

  it("does not echo an internal error", async () => {
    mocks.buildLiveReport.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const response = await getAnalysisPdf(get(`/api/projects/${projectId}/analysis-report`), ctx({ projectId }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
  });
});

describe("saved report PDF route", () => {
  it("serves a copy to its owner only", async () => {
    const ok = await getSavedPdf(get("/api/user/reports/ckreportaaaaaaaaaaaaaaaaaa/pdf"), ctx({ id: "ckreportaaaaaaaaaaaaaaaaaa" }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(mocks.getSavedAnalysisReport).toHaveBeenCalledWith("ckreportaaaaaaaaaaaaaaaaaa", "user-1");
    mocks.getSavedAnalysisReport.mockResolvedValueOnce(null);
    expect((await getSavedPdf(get("/api/user/reports/ckotherrrrrrrrrrrrrrrrrrr/pdf"), ctx({ id: "ckotherrrrrrrrrrrrrrrrrrr" }))).status).toBe(404);
    mocks.user = null;
    expect((await getSavedPdf(get("/api/user/reports/x/pdf"), ctx({ id: "x" }))).status).toBe(401);
  });
});

describe("analysis status route", () => {
  it("answers with the step only, and never with stored error text", async () => {
    mocks.getProjectAnalysisStatus.mockResolvedValue({ status: "FAILED", stage: null, error: "Upstream provider overpass-api.de returned 504" });
    const response = await getStatus(new NextRequest(`http://localhost/api/projects/${projectId}/analysis-status`, { headers: { "x-real-ip": "192.0.2.62" } }), ctx({ projectId }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toMatchObject({ success: true, status: "FAILED" });
  });

  it("requires a signed-in user and a project the user can read", async () => {
    mocks.user = null;
    expect((await getStatus(new NextRequest(`http://localhost/api/projects/${projectId}/analysis-status`), ctx({ projectId }))).status).toBe(401);
    mocks.user = { id: "user-1" };
    mocks.getProjectAnalysisStatus.mockResolvedValueOnce(null);
    expect((await getStatus(new NextRequest(`http://localhost/api/projects/${projectId}/analysis-status`, { headers: { "x-real-ip": "192.0.2.63" } }), ctx({ projectId }))).status).toBe(404);
  });
});

describe("saveAnalysisReport command", () => {
  it("saves a copy for the signed-in user in the reader's language", async () => {
    const response = await postProjects(command({ action: "saveAnalysisReport", projectId, locale: "en" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, result: { id: "ckreportaaaaaaaaaaaaaaaaaa" } });
    expect(mocks.saveAnalysisReportCopy).toHaveBeenCalledWith(projectId, "user-1", "en");
  });

  it("rejects an anonymous caller, a malformed project id and an unfinished analysis", async () => {
    mocks.user = null;
    expect((await postProjects(command({ action: "saveAnalysisReport", projectId }))).status).toBe(401);
    mocks.user = { id: "user-1" };
    expect((await postProjects(command({ action: "saveAnalysisReport", projectId: "nope" }))).status).toBe(400);
    mocks.saveAnalysisReportCopy.mockRejectedValueOnce(new Error("Analysis not completed"));
    expect((await postProjects(command({ action: "saveAnalysisReport", projectId }))).status).toBe(409);
    mocks.saveAnalysisReportCopy.mockRejectedValueOnce(new Error("Project not found"));
    expect((await postProjects(command({ action: "saveAnalysisReport", projectId }))).status).toBe(404);
  });

  it("allows twenty saves a minute and then answers 429", async () => {
    for (let index = 0; index < 20; index += 1) expect((await postProjects(command({ action: "saveAnalysisReport", projectId }))).status).toBe(200);
    expect((await postProjects(command({ action: "saveAnalysisReport", projectId }))).status).toBe(429);
  });
});
