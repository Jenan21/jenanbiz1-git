import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runMarketAnalysis, type MarketM3Result } from "@/services/analysis-engines/market-demand";
import { runMarketAnalysisPersisted } from "@/services/analysis-engines/market-demand/adapters/run-service";
import { EngineError } from "@/services/analysis-engines/shared/errors";
import { DataCenterError } from "@/services/data-center/contracts";
import { marketInstant, marketRequest } from "./support/market-demand-fixtures";
import { marketPortFixture } from "./support/market-data-fixtures";

const mocks = vi.hoisted(() => ({ run: vi.fn(), save: vi.fn() }));
vi.mock("@/services/analysis-engines/market-demand/adapters/data-center-provider", () => ({ runMarketDataCenterAnalysis: mocks.run }));
vi.mock("@/services/analysis-engines/market-demand/adapters/run-persistence", () => ({ persistMarketRun: mocks.save }));
const context = { runId: "service-test", evaluatedAt: marketInstant, createdAt: marketInstant, environment: "test" as const,
  timing: { startedAt: marketInstant, finishedAt: marketInstant, durationMs: 0 } };
const owner = { id: "owner", kind: "HUMAN" as const, systemRole: "USER" as const };
let result: MarketM3Result;
beforeAll(async () => {
  result = await runMarketAnalysis(marketRequest(), marketPortFixture().port, {
    runId: context.runId, evaluatedAt: context.evaluatedAt, environment: context.environment, timing: context.timing,
  });
});
beforeEach(() => { mocks.run.mockReset().mockResolvedValue(result); mocks.save.mockReset().mockResolvedValue(undefined); });
describe("Market M4 execution/persistence service ordering and explicit errors", () => {
  it("returns the original M3 result only after the exact shared run record was saved", async () => {
    expect(await runMarketAnalysisPersisted(marketRequest(), owner, context)).toBe(result);
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({ runId: result.runId, outputHash: result.determinism.outputHash, actor: { kind: "USER", id: owner.id } });
    expect(mocks.run.mock.invocationCallOrder[0]).toBeLessThan(mocks.save.mock.invocationCallOrder[0]!);
  });
  it("does not return a successful result before persistence finishes", async () => {
    let finish: () => void = () => { throw new Error("Save did not start"); };
    mocks.save.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    let returned = false;
    const work = runMarketAnalysisPersisted(marketRequest(), owner, context).then(() => { returned = true; });
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(returned).toBe(false);
    finish();
    await work;
    expect(returned).toBe(true);
  });
  it("surfaces a save failure, never converts it to a successful unsaved result", async () => {
    const error = new Error("Database unavailable"); mocks.save.mockRejectedValue(error);
    await expect(runMarketAnalysisPersisted(marketRequest(), owner, context)).rejects.toBe(error);
    expect(mocks.save).toHaveBeenCalledOnce();
  });
  it("saves EngineError failures and rethrows the original execution error", async () => {
    const error = new EngineError("INVALID_INPUT"); mocks.run.mockRejectedValue(error);
    await expect(runMarketAnalysisPersisted({}, owner, context)).rejects.toBe(error);
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({ status: "FAILED", errorCode: "INVALID_INPUT", result: null, inputs: [] });
  });
  it("retains both causes if execution and failure-history persistence fail", async () => {
    const execution = new EngineError("INVALID_INPUT"); const save = new Error("Save failed");
    mocks.run.mockRejectedValue(execution); mocks.save.mockRejectedValue(save);
    await expect(runMarketAnalysisPersisted({}, owner, context)).rejects.toMatchObject({ name: "AggregateError", errors: [execution, save] });
  });
  it.each([new DataCenterError("EXPLICIT_ROBOT_GRANT_REQUIRED", 403), new Error("Unexpected database outage")])("does not fabricate a computation failure for a policy/infrastructure exception: %s", async (error) => {
    mocks.run.mockRejectedValue(error);
    await expect(runMarketAnalysisPersisted({}, owner, context)).rejects.toBe(error);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([{ createdAt: "bad-date" }, { subject: "" }, { specialty: "" }])("validates trusted persistence context before running any calculation: %s", async (invalid) => {
    await expect(runMarketAnalysisPersisted({}, owner, { ...context, ...invalid })).rejects.toThrow();
    expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("binds robot provenance to the authenticated actor, not an independent client actor", async () => {
    const actor = { ...owner, kind: "AI" as const, robotId: "r", roleKey: "analyst", specialty: "market", missionId: "mission" };
    await runMarketAnalysisPersisted(marketRequest(), actor, { ...context, specialty: "market", missionContext: "study" });
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({ actor: { kind: "ROBOT", id: owner.id },
      runtime: { replayAuthorizationContext: { specialty: "market", missionContext: "study" } } });
    expect(mocks.save.mock.calls[0]![1]).toBe(actor);
  });
});
