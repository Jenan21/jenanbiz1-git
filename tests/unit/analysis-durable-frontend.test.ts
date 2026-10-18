import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAnalysisProject,
  findActiveAnalysisProject,
  pollAnalysisProgress,
  prepareAnalysisProject,
  startAnalysisRun,
  type AnalysisDraftIdentity,
  type AnalysisProgressState,
} from "@/components/projects/use-analysis-progress";
import { AnalysisRequestError, analysisFailureMessage, analysisSignInHref, retryAfterMilliseconds } from "@/lib/projects/analysis-errors";
import { readStudy } from "@/lib/projects/analysis-study";

function answer(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers });
}
const pending = { success: true, status: "PENDING", runId: "run-1" };

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("durable analysis polling", () => {
  it("never overlaps slow requests, and stops at persisted completion", async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }))
      .mockResolvedValueOnce(answer({ success: true, status: "COMPLETED", runId: "run-1" }));
    vi.stubGlobal("fetch", fetcher);
    const states: AnalysisProgressState[] = [];
    const stop = pollAnalysisProgress("project-1", (state) => states.push(state));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(answer({ ...pending, stage: "LOCATION" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)?.status).toBe("PENDING");
    await vi.advanceTimersByTimeAsync(1500);
    expect(states.at(-1)?.status).toBe("COMPLETED");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    stop();
  });

  it.each([401, 404])("stops explicitly on %s without leaking raw server errors", async (status) => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(answer({ success: false, error: "secret upstream provider message" }, status));
    vi.stubGlobal("fetch", fetcher);
    const states: AnalysisProgressState[] = [];
    const stop = pollAnalysisProgress("private-project", (state) => states.push(state));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(states[0]?.stopped).toBe(true);
    expect(states[0]?.error?.status).toBe(status);
    expect(analysisFailureMessage(states[0]?.error, false)).not.toContain("secret");
    stop();
  });

  it.each(["12", "Sun, 18 Oct 2026 09:24:29 GMT"])("honors Retry-After %s then recovers", async (retryAfter) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T09:24:17Z"));
    const fetcher = vi.fn().mockResolvedValueOnce(answer({ success: false }, 429, { "Retry-After": retryAfter }))
      .mockResolvedValueOnce(answer({ success: true, status: "FAILED", retryable: false, errorCode: "SOURCE_UNAVAILABLE" }));
    vi.stubGlobal("fetch", fetcher);
    const states: AnalysisProgressState[] = [];
    const stop = pollAnalysisProgress("p", (state) => states.push(state));
    await vi.advanceTimersByTimeAsync(0);
    expect(states[0]?.error?.retryAfterMs).toBe(12_000);
    await vi.advanceTimersByTimeAsync(11_999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(states.at(-1)).toMatchObject({ status: "FAILED", retryable: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    stop();
  });

  it("recovers from network failure without fabricating completion", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(answer({ ...pending, status: "PROCESSING", stage: "MARKET_DATA" })));
    const states: AnalysisProgressState[] = [];
    const stop = pollAnalysisProgress("p", (state) => states.push(state));
    await vi.advanceTimersByTimeAsync(0);
    expect(states[0]).toMatchObject({ known: false, error: { status: 0 }, stopped: false });
    await vi.advanceTimersByTimeAsync(5000);
    expect(states.at(-1)).toMatchObject({ known: true, status: "PROCESSING", stage: "MARKET_DATA" });
    stop();
  });

  it("aborts in-flight requests on unmount and ignores late responses", async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_url, options) => {
      signal = options.signal;
      return new Promise<Response>((done) => { resolve = done; });
    });
    vi.stubGlobal("fetch", fetcher);
    const update = vi.fn();
    const stop = pollAnalysisProgress("p", update);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(signal?.aborted).toBe(true);
    resolve(answer(pending));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(update).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("cancels a scheduled next poll when a screen is left", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(answer(pending));
    vi.stubGlobal("fetch", fetcher);
    const stop = pollAnalysisProgress("p", vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("durable run start and reload identity", () => {
  it("treats 202 as acceptance, not completion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(answer({ success: true, status: "PENDING" }))
      .mockResolvedValueOnce(answer({ success: true, result: { projectId: "p", runId: "r" } }, 202)));
    expect(await startAnalysisRun("p")).toEqual({ projectId: "p", runId: "r" });
  });

  it("reconciles a lost run POST acknowledgement without resending", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(answer({ success: true, status: "PENDING" }))
      .mockRejectedValueOnce(new TypeError("connection closed"))
      .mockResolvedValueOnce(answer({ ...pending, status: "PROCESSING" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await startAnalysisRun("p")).toEqual({ projectId: "p", runId: "run-1" });
    expect(fetcher.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
  });

  it("never resends when reloading an already running project", async () => {
    const fetcher = vi.fn().mockResolvedValue(answer(pending));
    vi.stubGlobal("fetch", fetcher);
    expect(await startAnalysisRun("p")).toEqual({ projectId: "p", runId: "run-1" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not start another job when status reconciliation itself is unavailable", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetcher);
    await expect(startAnalysisRun("p")).rejects.toThrow("offline");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reuses the created project after a save failure and session draft reload", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(answer({ success: true, result: { id: "created-project" } }))
      .mockResolvedValueOnce(answer({ success: false }, 503))
      .mockResolvedValueOnce(answer({ success: true, result: {} }));
    vi.stubGlobal("fetch", fetcher);
    let stored = "";
    const persist = (draft: AnalysisDraftIdentity) => { stored = JSON.stringify(draft); };
    const draft: AnalysisDraftIdentity = { projectId: null, createdKey: "", savedKey: "", idempotencyKey: "" };
    await expect(prepareAnalysisProject(draft, "same-input", { name: "Project" }, { idea: "Idea" }, persist)).rejects.toThrow();
    const reloaded = JSON.parse(stored);
    expect(await prepareAnalysisProject(reloaded, "same-input", { name: "Project" }, { idea: "Idea" }, persist)).toBe("created-project");
    const actions = fetcher.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(actions.map((body) => body.action)).toEqual(["create", "saveProjectAnalysis", "saveProjectAnalysis"]);
    expect(actions[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("persists and reuses a UUID when create acknowledgement is lost", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("lost create response"))
      .mockResolvedValueOnce(answer({ success: true, result: { id: "same-project" } }))
      .mockResolvedValueOnce(answer({ success: true, result: {} }));
    vi.stubGlobal("fetch", fetcher);
    let stored = "";
    const persist = (draft: AnalysisDraftIdentity) => { stored = JSON.stringify(draft); };
    const draft: AnalysisDraftIdentity = { projectId: null, createdKey: "", savedKey: "", idempotencyKey: "" };
    await expect(prepareAnalysisProject(draft, "same", {}, {}, persist)).rejects.toThrow();
    await prepareAnalysisProject(JSON.parse(stored), "same", {}, {}, persist);
    const bodies = fetcher.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies[0].idempotencyKey).toBe(bodies[1].idempotencyKey);
  });

  it("fetches a requested older project directly, never through the first 100", async () => {
    const project = { id: "project-101", intelligenceSnapshots: [] };
    const fetcher = vi.fn().mockResolvedValue(answer({ success: true, project }));
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchAnalysisProject("project-101")).toEqual(project);
    expect(fetcher.mock.calls[0][0]).toBe("/api/projects/project-101");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("discovers an active run beyond the first 100 projects and ignores unscheduled drafts", async () => {
    const projects = Array.from({ length: 100 }, (_, index) => ({ id: `project-${index}`, analysisStudy: { status: "PENDING" } }));
    const fetcher = vi.fn().mockResolvedValueOnce(answer({ success: true, projects }))
      .mockResolvedValueOnce(answer({ success: true, projects: [{ id: "active-101", analysisStudy: { status: "PENDING", runId: "r" } }] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await findActiveAnalysisProject()).toBe("active-101");
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual(["/api/projects?limit=100&offset=0", "/api/projects?limit=100&offset=100"]);
  });

  it("keeps an inaccessible requested project missing instead of substituting another", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ success: false }, 404)));
    await expect(fetchAnalysisProject("missing")).rejects.toMatchObject({ status: 404 });
  });

  it("preserves project/run context through the approved sign-in route", () => {
    const path = "/projects/analysis/progress?project=p&run=r";
    expect(analysisSignInHref(path)).toBe(`/auth?next=${encodeURIComponent(path)}`);
    expect(analysisSignInHref("//outside.example")).toBe("/auth?next=%2Fprojects%2Fanalysis");
    expect(readStudy({ status: "PROCESSING", runId: "r", errorCode: "SAFE_CODE", retryable: false })).toMatchObject({ runId: "r", retryable: false, errorCode: "SAFE_CODE" });
  });

  it("uses safe localized errors and robust Retry-After fallbacks", () => {
    expect(retryAfterMilliseconds("invalid")).toBe(60_000);
    expect(retryAfterMilliseconds("-1")).toBe(1000);
    expect(analysisFailureMessage(new AnalysisRequestError(429, undefined, 12_000), false)).toContain("12");
    expect(analysisFailureMessage(new AnalysisRequestError(401), true)).toContain("سجّل الدخول");
  });
});
