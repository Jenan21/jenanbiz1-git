export const PLATFORM_METRIC_KEYS = [
  "users", "organizations", "robots", "tasks", "sharedKnowledge", "learningLog", "verifiedEvidence", "modelExecutions", "costRecords",
] as const;

export type PlatformMetricKey = (typeof PLATFORM_METRIC_KEYS)[number];

// Every figure is a row count, so each label names the records it counts (a cost figure is a number of records, not an amount).
export const PLATFORM_METRIC_LABELS: Record<PlatformMetricKey, string> = {
  users: "المستخدمون",
  organizations: "المنظمات",
  robots: "الروبوتات",
  tasks: "مهام الروبوتات",
  sharedKnowledge: "سجلات المعرفة المشتركة",
  learningLog: "سجلات التعلّم",
  verifiedEvidence: "أدلة موثّقة",
  modelExecutions: "تنفيذات النماذج",
  costRecords: "سجلات التكلفة",
};

export type PlatformMetricsState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; measuredAt: string; counts: Record<PlatformMetricKey, number | null> };

/** A figure that is missing or not a plain count becomes null ("غير متاح"); it is never turned into zero. */
export function parsePlatformMetrics(payload: unknown): PlatformMetricsState {
  if (!payload || typeof payload !== "object") return { status: "unavailable" };
  const { measuredAt, counts } = payload as { measuredAt?: unknown; counts?: unknown };
  if (typeof measuredAt !== "string" || Number.isNaN(Date.parse(measuredAt)) || !counts || typeof counts !== "object") return { status: "unavailable" };
  const read = (key: PlatformMetricKey) => {
    const value = (counts as Record<string, unknown>)[key];
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  return { status: "ready", measuredAt, counts: Object.fromEntries(PLATFORM_METRIC_KEYS.map((key) => [key, read(key)])) as Record<PlatformMetricKey, number | null> };
}
