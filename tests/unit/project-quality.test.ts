import { describe, expect, it } from "vitest";
import { assessProjectQuality } from "@/services/projects/project-quality";

describe("project quality assessment", () => {
  const complete = ["MARKET", "FINANCIAL", "OPERATIONAL", "RISK", "TECHNICAL", "COMPLIANCE"].map((type) => ({
    type,
    score: 80,
    summary: "Evidence reviewed",
    source: "Verified source",
  })) as never[];

  it("uses explicit weights and permits a decision only with complete evidence", () => {
    const result = assessProjectQuality(complete);
    expect(result.score).toBe(80);
    expect(result.completeness).toBe(100);
    expect(result.readyForDecision).toBe(true);
    expect(result.verdict).toBe("APPROVE");
  });

  it("flags missing score, summary, or source as incomplete", () => {
    const result = assessProjectQuality(complete.slice(0, 4));
    expect(result.completeness).toBe(67);
    expect(result.missing).toEqual(["TECHNICAL", "COMPLIANCE"]);
    expect(result.readyForDecision).toBe(false);
    expect(result.verdict).toBe("INCOMPLETE");
  });

  it.each([NaN, Infinity, -1, 101, 80.5])("never approves an invalid score %s", (score) => {
    const result = assessProjectQuality([...complete.slice(1), { type: "MARKET", score, summary: "Claim", source: "Source" }] as never[]);
    expect(result.readyForDecision).toBe(false);
    expect(result.missing).toContain("MARKET");
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it("does not award score credit for missing sources or conflicting duplicate areas", () => {
    const unsourced = assessProjectQuality([{ type: "MARKET", score: 100, summary: "Claim", source: "" }]);
    expect(unsourced.score).toBe(0);
    const duplicate = assessProjectQuality([...complete, complete[0]!] as never[]);
    expect(duplicate.duplicates).toEqual(["MARKET"]);
    expect(duplicate.readyForDecision).toBe(false);
    expect(duplicate.evidenceStatus).toBe("USER_RECORDED_NOT_INDEPENDENTLY_VERIFIED");
  });
});
