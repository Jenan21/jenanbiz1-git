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
});
