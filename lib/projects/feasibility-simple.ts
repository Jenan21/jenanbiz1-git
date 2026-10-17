import type { AnalysisResult } from "@/lib/projects/analysis-study";

export function budgetRangeFor(capital: number) {
  if (!Number.isFinite(capital) || capital <= 0) return undefined;
  if (capital < 100_000) return "UNDER_100K" as const;
  if (capital <= 500_000) return "BETWEEN_100K_500K" as const;
  if (capital <= 1_000_000) return "BETWEEN_500K_1M" as const;
  return "ABOVE_1M" as const;
}

export type PreliminaryVerdict = "SUITABLE" | "REVIEW" | "INSUFFICIENT";

/** The short-study verdict follows the evidence behind the figures, never a promised return. */
export function preliminaryVerdict(result: Pick<AnalysisResult, "evidenceCompleteness" | "dataRiskLevel">): PreliminaryVerdict {
  if (result.evidenceCompleteness >= 70 && result.dataRiskLevel !== "HIGH") return "SUITABLE";
  if (result.evidenceCompleteness >= 45) return "REVIEW";
  return "INSUFFICIENT";
}
