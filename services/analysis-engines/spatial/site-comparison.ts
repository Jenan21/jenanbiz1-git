import { compareText, roundTo } from "../shared/canonical";
import type { EngineMetric } from "../shared/contracts";
import { createGap, type Gap } from "../shared/gaps";
import { bandRank, platformStateFor } from "../shared/states";
import type { SpatialResult } from "./contracts";
import { spatialGapCatalog } from "./gaps";

const LIMITATION = "Descriptive descending numeric order only, not site preference or a business judgment; ties use target id. Min-max scaling uses comparable mapped observations only.";

export function compareSites(results: SpatialResult["results"], targets: readonly string[], covered: (target: string, metric: EngineMetric) => boolean = () => true): { results: SpatialResult["results"]; gaps: Gap[] } {
  const groups = new Map<string, Map<string, EngineMetric>>();
  for (const result of results) for (const metric of result.metrics) {
    if (!["DISTANCE", "AREA", "COUNT", "DENSITY", "POPULATION"].includes(metric.valueKind)) continue;
    const key = `${result.analysis}/${metric.key}`;
    const group = groups.get(key) ?? new Map<string, EngineMetric>();
    group.set(result.target, metric);
    groups.set(key, group);
  }
  const output = new Map(targets.map((target) => [target, [] as EngineMetric[]]));
  const gaps: Gap[] = [];
  for (const [key, group] of [...groups.entries()].sort(([a], [b]) => compareText(a, b))) {
    const values = [...group.values()];
    const comparable = group.size === targets.length && [...group.entries()].every(([target, metric]) => typeof metric.value === "number" && covered(target, metric))
      && values.every((metric) => metric.inputRefs.join("\0") === values[0]?.inputRefs.join("\0") && metric.unit === values[0]?.unit && metric.method === values[0]?.method);
    const ordered = [...group.entries()].sort(([a, x], [b, y]) => Number(y.value) - Number(x.value) || compareText(a, b));
    const numeric = values.map((metric) => Number(metric.value));
    const minimum = Math.min(...numeric), maximum = Math.max(...numeric);
    const weakest = values.map((metric) => metric.confidence).filter((entry) => entry !== null)
      .sort((a, b) => bandRank(a.band) - bandRank(b.band) || a.score - b.score)[0] ?? null;
    if (!comparable) gaps.push(createGap(spatialGapCatalog, "SITE_METRIC_NOT_COMPARABLE", { metric: key }, { subject: key }));
    for (const target of targets) {
      const original = group.get(target) ?? values[0];
      if (original === undefined) continue;
      for (const suffix of ["normalized", "rank"] as const) {
        const status = !comparable ? "NOT_COMPUTABLE" : suffix === "rank" && original.status === "ESTIMATED" ? "PARTIAL" : original.status;
        output.get(target)?.push({
          ...original, key: `comparison.${original.key}.${suffix}`, status, platformState: platformStateFor(status),
          label: { ar: `${original.label.ar} — ${suffix === "rank" ? "الترتيب الرقمي الوصفي" : "القيمة الموحدة"}`, en: `${original.label.en} — ${suffix === "rank" ? "descriptive numeric rank" : "normalized value"}` },
          valueKind: suffix === "normalized" ? "RATIO" : "ORDINAL", unit: suffix === "normalized" ? "ratio" : "none",
          value: !comparable ? null : suffix === "rank" ? ordered.findIndex(([id]) => id === target) + 1
            : maximum === minimum ? 0.5 : roundTo((Number(original.value) - minimum) / (maximum - minimum), 6),
          interpretation: status === "ESTIMATED" ? "ESTIMATE" : "MAPPED_FEATURES_ONLY",
          confidence: comparable ? weakest : null,
          method: suffix === "normalized" ? "min-max-v1/equal=0.5" : "descending-numeric-v1/tie=target-id",
          limitations: [...new Set([...original.limitations, LIMITATION])].sort(compareText),
        });
      }
    }
  }
  return { results: [...output.entries()].map(([target, metrics]) => ({ analysis: "SITE_COMPARISON", target, metrics: metrics.sort((a, b) => compareText(a.key, b.key)) })), gaps };
}
