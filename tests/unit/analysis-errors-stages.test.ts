import { describe, expect, it } from "vitest";
import { AnalysisRequestError, analysisFailureMessage, analysisStoppedMessage, reportSaveMessage } from "@/lib/projects/analysis-errors";
import { ANALYSIS_STAGES, completedStages, readStage, readStudy } from "@/lib/projects/analysis-study";

describe("failure messages", () => {
  const server = "Upstream provider overpass-api.de returned 504 Gateway Timeout";

  it("never carry the server's own text, in either language", () => {
    for (const ar of [true, false]) {
      for (const status of [400, 401, 404, 409, 429, 500, 502]) {
        const message = analysisFailureMessage(new AnalysisRequestError(status), ar);
        expect(message).not.toContain("overpass");
        expect(message).not.toMatch(/504|Gateway|provider/i);
        expect(reportSaveMessage(new AnalysisRequestError(status), ar)).not.toMatch(/overpass|504|Gateway/i);
      }
      expect(analysisFailureMessage(new Error(server), ar)).not.toContain("overpass");
      expect(analysisStoppedMessage(ar)).not.toContain("overpass");
    }
  });

  it("reads Arabic for Arabic readers and English for English readers", () => {
    expect(analysisFailureMessage(new AnalysisRequestError(500), true)).toMatch(/[\u0600-\u06FF]/);
    expect(analysisFailureMessage(new AnalysisRequestError(500), false)).not.toMatch(/[\u0600-\u06FF]/);
    expect(analysisFailureMessage(new AnalysisRequestError(401), true)).toContain("جلستك");
    expect(analysisFailureMessage(new AnalysisRequestError(400, "UNREADABLE_TEXT"), true)).toContain("وصف الفكرة");
    expect(reportSaveMessage(new AnalysisRequestError(409), true)).toContain("لم يكتمل");
    expect(reportSaveMessage(new TypeError("fetch failed"), false)).toContain("could not be saved");
  });
});

describe("analysis stages", () => {
  it("are five real steps in a fixed order", () => {
    expect(ANALYSIS_STAGES).toEqual(["LOCATION", "MARKET_DATA", "COMPETITION", "RECOMMENDATIONS", "REPORT"]);
  });

  it("reads the recorded step, including the one an older run saved", () => {
    expect(readStage("COMPETITION")).toBe("COMPETITION");
    expect(readStage("MARKET_INTELLIGENCE")).toBe("MARKET_DATA");
    expect(readStage("nonsense")).toBeUndefined();
    expect(readStage(undefined)).toBeUndefined();
  });

  it("counts finished steps from the current one, and all of them once complete", () => {
    expect(completedStages(undefined, undefined)).toBe(0);
    expect(completedStages("LOCATION", "PROCESSING")).toBe(0);
    expect(completedStages("COMPETITION", "PROCESSING")).toBe(2);
    expect(completedStages("REPORT", "PROCESSING")).toBe(4);
    expect(completedStages(undefined, "COMPLETED")).toBe(5);
  });

  it("reads the current step of a study that is still processing, and none otherwise", () => {
    expect(readStudy({ status: "PROCESSING", processingStep: "RECOMMENDATIONS", input: { idea: "x", city: "y", targetAudience: "CONSUMERS" } }).stage).toBe("RECOMMENDATIONS");
    expect(readStudy({ status: "COMPLETED", processingStep: "REPORT" }).stage).toBeUndefined();
  });
});
