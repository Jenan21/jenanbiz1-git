import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runCompetitorAnalysis, type CompetitorAnalyticsResult } from "@/services/analysis-engines/competitor-analysis";
import { runCompetitorAnalysisPersisted } from "@/services/analysis-engines/competitor-analysis/adapters/run-service";
import { EngineError } from "@/services/analysis-engines/shared/errors";
import { DataCenterError } from "@/services/data-center/contracts";
import { competitorInstant, competitorRequest } from "./support/competitor-analysis-fixtures";
import { competitorPortFixture } from "./support/competitor-data-fixtures";

const mocks = vi.hoisted(() => ({ run: vi.fn(), save: vi.fn() }));
vi.mock("@/services/analysis-engines/competitor-analysis/adapters/data-center-provider", () => ({ runCompetitorDataCenterAnalysis: mocks.run }));
vi.mock("@/services/analysis-engines/competitor-analysis/adapters/run-persistence", () => ({ persistCompetitorRun: mocks.save }));
const context = { runId: "competitor:service", evaluatedAt: competitorInstant, createdAt: competitorInstant, environment: "test" as const,
  timing: { startedAt: competitorInstant, finishedAt: competitorInstant, durationMs: 0 } };
const actor = { id: "owner", kind: "HUMAN" as const, systemRole: "USER" as const };
let result: CompetitorAnalyticsResult;
beforeAll(async () => {
  const request = competitorRequest(); request.data.roles = {};
  const { runId, evaluatedAt, environment, timing } = context;
  result = await runCompetitorAnalysis(competitorPortFixture().port, request, { runId, evaluatedAt, environment, timing });
});
beforeEach(() => { mocks.run.mockReset().mockResolvedValue(result); mocks.save.mockReset().mockResolvedValue(undefined); });
describe("Competitor M4 persisted service ordering and explicit errors", () => {
  it("returns the original governed result only after its full shared record is persisted", async () => {
    expect(await runCompetitorAnalysisPersisted(competitorRequest(), actor, context)).toBe(result);
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({ outputHash: result.determinism.outputHash, actor: { kind: "USER", id: actor.id } });
    expect(mocks.run.mock.invocationCallOrder[0]).toBeLessThan(mocks.save.mock.invocationCallOrder[0]!);
  });
  it("does not return an unsaved result while a save is pending", async () => {
    let finish: () => void = () => { throw new Error("Save has not begun"); };
    mocks.save.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    let returned = false;
    const pending = runCompetitorAnalysisPersisted(competitorRequest(), actor, context).then(() => { returned = true; });
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(returned).toBe(false); finish(); await pending; expect(returned).toBe(true);
  });
  it("surfaces persistence failures instead of returning success", async () => {
    const error = new Error("Save failed"); mocks.save.mockRejectedValue(error);
    await expect(runCompetitorAnalysisPersisted(competitorRequest(), actor, context)).rejects.toBe(error);
  });
  it("persists EngineError failure history and rethrows the execution error", async () => {
    const error = new EngineError("INVALID_INPUT"); mocks.run.mockRejectedValue(error);
    await expect(runCompetitorAnalysisPersisted({}, actor, context)).rejects.toBe(error);
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({ status: "FAILED", errorCode: "INVALID_INPUT", result: null, inputs: [] });
  });
  it("retains both causes when failure-history persistence also fails", async () => {
    const error = new EngineError("INVALID_INPUT"); const save = new Error("Save failed");
    mocks.run.mockRejectedValue(error); mocks.save.mockRejectedValue(save);
    await expect(runCompetitorAnalysisPersisted({}, actor, context)).rejects.toMatchObject({ name: "AggregateError", errors: [error, save] });
  });
  it.each([new DataCenterError("EXPLICIT_ROBOT_GRANT_REQUIRED", 403), new Error("Infrastructure failure")])("does not relabel policy/infrastructure failures: %s", async (error) => {
    mocks.run.mockRejectedValue(error);
    await expect(runCompetitorAnalysisPersisted({}, actor, context)).rejects.toBe(error);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([{ createdAt: "bad" }, { subject: "" }, { specialty: "" }])("validates trusted context before I/O: %j", async (invalid) => {
    await expect(runCompetitorAnalysisPersisted({}, actor, { ...context, ...invalid })).rejects.toThrow();
    expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("binds robot records to the authenticated actor", async () => {
    const robot = { ...actor, kind: "AI" as const, robotId: "r", roleKey: "analyst", specialty: "competitor", missionId: "m" };
    await runCompetitorAnalysisPersisted(competitorRequest(), robot, { ...context, specialty: "competitor" });
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({ actor: { kind: "ROBOT", id: robot.id }, runtime: { replayAuthorizationContext: { specialty: "competitor" } } });
    expect(mocks.save.mock.calls[0]![1]).toBe(robot);
  });
});
