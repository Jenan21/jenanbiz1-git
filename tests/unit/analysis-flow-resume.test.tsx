import { beforeEach, describe, expect, it, vi } from "vitest";
import { analysisReturnPath } from "@/lib/projects/analysis-errors";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ requireUser }));
vi.mock("@/lib/i18n/server", () => ({ getRequestDictionary: async () => ({ locale: "en" }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/components/custom/platform-shell", () => ({ PlatformShell: () => null }));
vi.mock("@/components/projects/projects-workspace", () => ({ ProjectsWorkspace: () => null }));
vi.mock("@/components/projects/project-flow-navigation", () => ({ ProjectFlowNavigation: () => null }));
vi.mock("@/components/projects/professional-feasibility-workspace", () => ({ ProfessionalFeasibilityWorkspace: () => null }));
vi.mock("@/components/projects/project-analysis-workspace", () => ({ ProjectAnalysisWorkspace: () => null }));
vi.mock("@/components/projects/project-analysis-dashboard", () => ({ ProjectAnalysisDashboard: () => null }));
vi.mock("@/components/projects/project-start-workspace", () => ({ ProjectStartWorkspace: () => null }));
vi.mock("@/components/projects/project-evaluation-dashboard", () => ({ ProjectEvaluationWorkspace: () => null }));

import ProjectFlowPage from "@/app/projects/[...flow]/page";
import { ProjectsLiveServicePage } from "@/components/projects/projects-live-service-page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ email: "owner@example.test", profile: null });
});

describe("analysis child route authentication resume", () => {
  it("preserves the actual progress path, project, and run before client code executes", async () => {
    const page = await ProjectFlowPage({
      params: Promise.resolve({ flow: ["analysis", "progress"] }),
      searchParams: Promise.resolve({ project: "p", run: "r", next: "//external.example" }),
    });
    await ProjectsLiveServicePage(page.props);
    expect(requireUser).toHaveBeenCalledWith("/projects/analysis/progress?project=p&run=r");
  });

  it("retains child-route context when an expired session redirects to sign-in", async () => {
    requireUser.mockRejectedValue(new Error("authentication redirect"));
    const page = await ProjectFlowPage({
      params: Promise.resolve({ flow: ["analysis", "report"] }),
      searchParams: Promise.resolve({ project: "saved-project", run: "saved-run" }),
    });
    await expect(ProjectsLiveServicePage(page.props)).rejects.toThrow("authentication redirect");
    expect(requireUser).toHaveBeenCalledWith("/projects/analysis/report?project=saved-project&run=saved-run");
  });

  it("encodes values and drops arrays, oversized identifiers, and unsafe return paths", () => {
    expect(analysisReturnPath("/projects/analysis/progress", { project: "p&next=//external", run: ["r", "other"] }))
      .toBe("/projects/analysis/progress?project=p%26next%3D%2F%2Fexternal");
    expect(analysisReturnPath("//external.example", { project: "x".repeat(201) })).toBe("/projects/analysis");
    expect(analysisReturnPath("/projects/../auth")).toBe("/projects/analysis");
  });
});
