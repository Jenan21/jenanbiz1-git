import { expect } from "vitest";
import { EngineError, type EngineMetric } from "@/services/analysis-engines/shared";
import { runSpatialAnalysis, type RunSpatialOptions, type SpatialResult } from "@/services/analysis-engines/spatial";
import { verdictArabic, verdictEnglish } from "./analysis-engine-fixtures";
import { FakeMapPort, type FakeBehaviour } from "./spatial-fake-map-port";
import { baseRequest } from "./spatial-request-fixtures";

export const CLOCK = "2026-10-20T12:00:00.000Z";

export const contextRequest = (over: Record<string, unknown> = {}, roles: string[] = ["place:neighbourhood"]) =>
  baseRequest({ analyses: ["LOCATION_CONTEXT"], parameters: { roles }, ...over } as never);

/** Runs the engine against a scripted port with a fixed clock; the port is returned so a test can see what the engine asked of it. */
export function run(request: unknown, behaviour: FakeBehaviour = {}, options: Partial<RunSpatialOptions> = {}) {
  const port = new FakeMapPort(behaviour);
  const result = runSpatialAnalysis(port, request, { environment: "test", clock: () => new Date(CLOCK), newRunId: () => "run-1", ...options });
  return { port, result };
}
export const resultOf = async (request: unknown, behaviour: FakeBehaviour = {}, options: Partial<RunSpatialOptions> = {}) => run(request, behaviour, options).result;
export const failureOf = async (promise: Promise<unknown>): Promise<EngineError> => {
  const error = await promise.then(() => null, (thrown: unknown) => thrown);
  expect(error).toBeInstanceOf(EngineError);
  return error as EngineError;
};

export const metricsOf = (result: SpatialResult, target = "primary"): Record<string, EngineMetric> =>
  Object.fromEntries((result.results.find((entry) => entry.target === target)?.metrics ?? []).map((metric) => [metric.key, metric]));
export const gapCodes = (result: SpatialResult) => result.gaps.map((gap) => gap.code);
export const gapsOf = (result: SpatialResult, code: string) => result.gaps.filter((gap) => gap.code === code);
export const statuses = (result: SpatialResult, target = "primary") => Object.fromEntries(Object.entries(metricsOf(result, target)).map(([key, metric]) => [key, metric.status]));

/** Every sentence a result says about the data. */
export function sentencesOf(result: SpatialResult): { english: string[]; arabic: string[] } {
  const english: string[] = [];
  const arabic: string[] = [];
  for (const gap of result.gaps) { english.push(gap.message.en, gap.remedy.en); arabic.push(gap.message.ar, gap.remedy.ar); }
  for (const entry of result.results) for (const metric of entry.metrics) { english.push(metric.label.en, ...metric.limitations); arabic.push(metric.label.ar); }
  for (const input of result.inputs) english.push(...input.limitations);
  return { english, arabic };
}
export function expectNoVerdictsAndNoPercentages(result: SpatialResult) {
  const { english, arabic } = sentencesOf(result);
  for (const text of english) { expect(text).not.toMatch(verdictEnglish); expect(text).not.toContain("%"); }
  for (const text of arabic) { expect(text).not.toMatch(verdictArabic); expect(text).not.toContain("٪"); }
}
