import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
  latestReport: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/i18n/server", () => ({ getRequestDictionary: async () => ({ locale: "en" }) }));
vi.mock("@/services/projects/project-analysis", () => ({ findLatestAnalysisReportId: mocks.latestReport }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/projects/project-analysis-dashboard", () => ({ ProjectAnalysisDashboard: () => null }));

import ProjectAnalysisPage from "@/app/projects/analysis/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner", email: "owner@example.test", profile: null });
  mocks.latestReport.mockResolvedValue(null);
});

describe("analysis entry reload context", () => {
  it("preserves project and run through authentication and resumes the durable workspace", async () => {
    await expect(ProjectAnalysisPage({ searchParams: Promise.resolve({ project: "saved-project", run: "saved-run" }) }))
      .rejects.toThrow("redirect:/projects/analysis/progress?project=saved-project&run=saved-run");
    expect(mocks.requireUser).toHaveBeenCalledWith("/projects/analysis?project=saved-project&run=saved-run");
    expect(mocks.latestReport).not.toHaveBeenCalled();
  });

  it("does not drop project context when authentication itself requires sign-in", async () => {
    mocks.requireUser.mockRejectedValue(new Error("sign-in required"));
    await expect(ProjectAnalysisPage({ searchParams: Promise.resolve({ project: "p", run: "r" }) })).rejects.toThrow("sign-in required");
    expect(mocks.requireUser).toHaveBeenCalledWith("/projects/analysis?project=p&run=r");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("still opens the canonical dashboard without saved run context", async () => {
    const page = await ProjectAnalysisPage({ searchParams: Promise.resolve({}) });
    expect(page.props).toMatchObject({ latestReportId: null, locale: "en", userLabel: "owner@example.test" });
    expect(mocks.requireUser).toHaveBeenCalledWith("/projects/analysis");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
