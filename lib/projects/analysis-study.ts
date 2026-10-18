import type { Locale } from "@/types/i18n";

export type JsonRecord = Record<string, unknown>;
export type AnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

/** The real steps of a run, in order; the server records the one it is working on and the screens only read it. */
export const ANALYSIS_STAGES = ["LOCATION", "MARKET_DATA", "COMPETITION", "RECOMMENDATIONS", "REPORT"] as const;
export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

/** Runs saved before the stages existed recorded a single market step. */
export function readStage(value: unknown): AnalysisStage | undefined {
  if (value === "MARKET_INTELLIGENCE") return "MARKET_DATA";
  return ANALYSIS_STAGES.find((stage) => stage === value);
}

/** How many stages are finished: those before the current one, or all of them once the run is complete. */
export function completedStages(stage: AnalysisStage | undefined, status: AnalysisStatus | undefined) {
  if (status === "COMPLETED") return ANALYSIS_STAGES.length;
  return stage ? ANALYSIS_STAGES.indexOf(stage) : 0;
}

export type AnalysisInput = {
  idea: string;
  city: string;
  targetAudience: string;
  budgetRange?: string;
  latitude?: number;
  longitude?: number;
  expectedCapital?: number;
  areaSqm?: number;
  projectSize?: string;
  placeLabel?: string;
};
export type AnalysisResult = {
  generatedAt: string;
  evidenceCompleteness: number;
  competitionLevel: "LOW" | "MODERATE" | "HIGH" | "UNAVAILABLE";
  purchasingPowerLevel: "LOW" | "MODERATE" | "HIGH" | "UNAVAILABLE";
  dataRiskLevel: "LOW" | "MODERATE" | "HIGH";
  competitorCount: number | null;
  sourceCount: number;
  limitationCount: number;
  recommendations: string[];
};
export type AnalysisStudy = {
  status: AnalysisStatus;
  input?: AnalysisInput;
  result?: AnalysisResult;
  stage?: AnalysisStage;
  error?: string;
  updatedAt?: string;
  runId?: string;
  errorCode?: string;
  retryable?: boolean;
};

export function analysisReportIsCurrent(study: AnalysisStudy, status: AnalysisStatus, runId?: string) {
  return status === "COMPLETED" && study.status === "COMPLETED" && Boolean(study.result) && (!runId || study.runId === runId);
}

export type IntelligenceMetric = {
  value: number | null;
  unit?: string;
  period?: string;
};
export type Competitor = {
  id?: string;
  name?: string;
  kind?: string;
  distanceKm?: number | null;
  latitude?: number;
  longitude?: number;
};
export type IntelligenceSource = {
  source?: string;
  url?: string | null;
  retrievedAt?: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  note?: string;
};
export type IntelligenceSnapshot = {
  id: string;
  query: string;
  location?: unknown;
  population?: unknown;
  purchasingPower?: unknown;
  costInflation?: unknown;
  competitors?: unknown;
  sources?: unknown;
  limitations?: unknown;
  fetchedAt: string;
};
export type AnalysisProject = {
  id: string;
  name: string;
  sector?: string | null;
  countryCode?: string | null;
  analysisStudy?: unknown;
  analysisStudyUpdatedAt?: string | null;
  intelligenceSnapshots: IntelligenceSnapshot[];
  assessments: Array<{
    id: string;
    type: string;
    score: number;
    verdict: string;
  }>;
  risks: Array<{
    id: string;
    title: string;
    score: number;
    status: string;
  }>;
  evidenceFiles: Array<{
    id: string;
    fileName: string;
  }>;
};

export const resultRecommendations: Record<string, readonly [string, string]> = {
  VALIDATE_MARKET_DEMAND: [
    "تحقق من الطلب محليًا بمقابلات أو تجربة سوقية قبل الالتزام بالاستثمار.",
    "Validate local demand with interviews or a market pilot before committing investment.",
  ],
  DIFFERENTIATE_OFFER: [
    "صِغ عرضًا متمايزًا بوضوح لأن بيانات المنافسين تشير إلى سوق يحتاج تموضعًا أدق.",
    "Define a clearly differentiated offer because competitor evidence calls for sharper positioning.",
  ],
  OBTAIN_LOCAL_PURCHASING_DATA: [
    "أضف مصدرًا محليًا حديثًا للقوة الشرائية؛ المؤشر الدولي وحده غير متاح أو غير كافٍ.",
    "Add a current local purchasing-power source; international coverage is unavailable or insufficient.",
  ],
  VERIFY_LOCATION: [
    "راجع اسم الموقع أو إحداثياته قبل الاعتماد على نتيجة المنافسين.",
    "Verify the location name or coordinates before relying on competitor results.",
  ],
  REVIEW_SOURCE_LIMITATIONS: [
    "راجع قيود المصادر الظاهرة في التقرير وعالج الفجوات قبل القرار النهائي.",
    "Review the reported source limitations and close the gaps before a final decision.",
  ],
  PROCEED_TO_DETAILED_FEASIBILITY: [
    "اكتمال الأدلة يسمح بالانتقال إلى دراسة جدوى تفصيلية مع بقاء الحاجة لمراجعة بشرية.",
    "Evidence coverage supports moving to detailed feasibility, subject to human review.",
  ],
};

export const audienceLabels: Record<string, readonly [string, string]> = {
  CONSUMERS: ["الأفراد والمستهلكون", "Consumers"],
  BUSINESSES: ["الشركات والمنشآت", "Businesses"],
  YOUTH: ["الشباب والموظفون", "Young people and employees"],
  FAMILIES: ["العائلات", "Families"],
};

export const budgetLabels: Record<string, readonly [string, string]> = {
  UNDER_100K: ["أقل من 100 ألف ر.س", "Under SAR 100K"],
  BETWEEN_100K_500K: ["100 - 500 ألف ر.س", "SAR 100K - 500K"],
  BETWEEN_500K_1M: ["500 ألف - مليون ر.س", "SAR 500K - 1M"],
  ABOVE_1M: ["أكثر من مليون ر.س", "Above SAR 1M"],
};

export const cityLabels: Record<string, readonly [string, string]> = {
  Riyadh: ["الرياض", "Riyadh"],
  Jeddah: ["جدة", "Jeddah"],
  Dammam: ["الدمام", "Dammam"],
  Khobar: ["الخبر", "Khobar"],
  Makkah: ["مكة المكرمة", "Makkah"],
  Madinah: ["المدينة المنورة", "Madinah"],
  Taif: ["الطائف", "Taif"],
  Buraydah: ["بريدة", "Buraydah"],
  Tabuk: ["تبوك", "Tabuk"],
  Abha: ["أبها", "Abha"],
  Hail: ["حائل", "Hail"],
  Jazan: ["جازان", "Jazan"],
};

export function t(ar: boolean, arabic: string, english: string) {
  return ar ? arabic : english;
}

export function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

export function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function readStudy(value: unknown): AnalysisStudy {
  const record = asRecord(value);
  const status = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"].includes(
    String(record?.status),
  )
    ? (record?.status as AnalysisStatus)
    : "PENDING";
  const inputRecord = asRecord(record?.input);
  const resultRecord = asRecord(record?.result);
  const input =
    typeof inputRecord?.idea === "string" &&
    typeof inputRecord.city === "string" &&
    typeof inputRecord.targetAudience === "string"
      ? ({
          idea: inputRecord.idea,
          city: inputRecord.city,
          targetAudience: inputRecord.targetAudience,
          ...(typeof inputRecord.budgetRange === "string"
            ? { budgetRange: inputRecord.budgetRange }
            : {}),
          ...(typeof inputRecord.latitude === "number" && typeof inputRecord.longitude === "number"
            ? { latitude: inputRecord.latitude, longitude: inputRecord.longitude }
            : {}),
          ...(typeof inputRecord.expectedCapital === "number" && inputRecord.expectedCapital > 0
            ? { expectedCapital: inputRecord.expectedCapital }
            : {}),
          ...(typeof inputRecord.areaSqm === "number" && inputRecord.areaSqm > 0 ? { areaSqm: inputRecord.areaSqm } : {}),
          ...(typeof inputRecord.projectSize === "string" ? { projectSize: inputRecord.projectSize } : {}),
          ...(typeof inputRecord.placeLabel === "string" ? { placeLabel: inputRecord.placeLabel } : {}),
        } satisfies AnalysisInput)
      : undefined;
  const result =
    status === "COMPLETED" && typeof resultRecord?.evidenceCompleteness === "number"
      ? ({
          generatedAt:
            typeof resultRecord.generatedAt === "string"
              ? resultRecord.generatedAt
              : "",
          // Results saved before the competitor fix counted an empty search as "0 competitors, low": that is a gap in
          // the map data, so it is shown as unavailable and no longer earns the competitor share of the score.
          evidenceCompleteness:
            resultRecord.competitorCount === 0 && resultRecord.competitionLevel === "LOW"
              ? Math.max(0, resultRecord.evidenceCompleteness - 15)
              : resultRecord.evidenceCompleteness,
          competitionLevel: (resultRecord.competitorCount === 0 && resultRecord.competitionLevel === "LOW"
            ? "UNAVAILABLE"
            : String(resultRecord.competitionLevel)) as AnalysisResult["competitionLevel"],
          purchasingPowerLevel: String(
            resultRecord.purchasingPowerLevel,
          ) as AnalysisResult["purchasingPowerLevel"],
          dataRiskLevel: String(
            resultRecord.dataRiskLevel,
          ) as AnalysisResult["dataRiskLevel"],
          competitorCount:
            typeof resultRecord.competitorCount === "number" && resultRecord.competitorCount > 0
              ? resultRecord.competitorCount
              : null,
          sourceCount:
            typeof resultRecord.sourceCount === "number"
              ? resultRecord.sourceCount
              : 0,
          limitationCount:
            typeof resultRecord.limitationCount === "number"
              ? resultRecord.limitationCount
              : 0,
          recommendations: asArray(resultRecord.recommendations).filter(
            (item): item is string => typeof item === "string",
          ),
        } satisfies AnalysisResult)
      : undefined;
  return {
    status,
    input,
    result,
    stage: status === "PROCESSING" ? readStage(record?.processingStep) : undefined,
    error: typeof record?.error === "string" ? record.error : undefined,
    updatedAt:
      typeof record?.updatedAt === "string" ? record.updatedAt : undefined,
    runId: typeof record?.runId === "string" ? record.runId : undefined,
    errorCode: typeof record?.errorCode === "string" ? record.errorCode : undefined,
    retryable: typeof record?.retryable === "boolean" ? record.retryable : undefined,
  };
}

export function readMetric(value: unknown): IntelligenceMetric {
  const record = asRecord(value);
  // Snapshots store the year as `year` and the unit as `metric`; `period` and `unit` are accepted for older shapes.
  return {
    value: typeof record?.value === "number" ? record.value : null,
    unit: typeof record?.unit === "string" ? record.unit : typeof record?.metric === "string" ? record.metric : undefined,
    period: typeof record?.period === "string" ? record.period : typeof record?.year === "number" ? String(record.year) : undefined,
  };
}

export function readCompetitors(value: unknown): Competitor[] {
  return asArray(value)
    .map(asRecord)
    .filter((item): item is JsonRecord => Boolean(item))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : undefined,
      name: typeof item.name === "string" ? item.name : undefined,
      kind: typeof item.kind === "string" ? item.kind : undefined,
      ...(typeof item.category === "string" ? { kind: item.category } : {}),
      distanceKm:
        typeof item.distanceKm === "number" ? item.distanceKm : null,
      latitude:
        typeof item.latitude === "number" ? item.latitude : undefined,
      longitude:
        typeof item.longitude === "number" ? item.longitude : undefined,
    }));
}

export function readSources(value: unknown): IntelligenceSource[] {
  return asArray(value)
    .map(asRecord)
    .filter((item): item is JsonRecord => Boolean(item))
    .map((item) => ({
      source: typeof item.source === "string" ? item.source : undefined,
      url: typeof item.url === "string" ? item.url : null,
      retrievedAt:
        typeof item.retrievedAt === "string"
          ? item.retrievedAt
          : typeof item.fetchedAt === "string"
            ? item.fetchedAt
            : undefined,
      confidence: ["HIGH", "MEDIUM", "LOW"].includes(String(item.confidence))
        ? (item.confidence as IntelligenceSource["confidence"])
        : undefined,
      note: typeof item.note === "string" ? item.note : undefined,
    }));
}

export function readLimitations(value: unknown) {
  return asArray(value).filter(
    (item): item is string => typeof item === "string",
  );
}

export function formatNumber(
  value: number | null | undefined,
  locale: Locale,
  maximumFractionDigits = 1,
) {
  if (value === null || value === undefined) return locale === "ar" ? "غير متاح" : "Unavailable";
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits,
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
  }).format(value);
}

export function formatDate(value: string | undefined, locale: Locale) {
  if (!value) return locale === "ar" ? "غير متاح" : "Unavailable";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function levelLabel(
  value: string | undefined,
  ar: boolean,
  unavailable = true,
) {
  const labels: Record<string, readonly [string, string]> = {
    LOW: ["منخفض", "Low"],
    MODERATE: ["متوسط", "Moderate"],
    MEDIUM: ["متوسط", "Moderate"],
    HIGH: ["مرتفع", "High"],
    UNAVAILABLE: ["غير متاح", "Unavailable"],
  };
  const key = value ?? (unavailable ? "UNAVAILABLE" : "LOW");
  return labels[key] ? t(ar, ...labels[key]) : t(ar, "غير متاح", "Unavailable");
}

/** Which of the six evidence checks behind the completeness score the saved snapshot satisfies. */
export function evidenceChecks(
  snapshot: IntelligenceSnapshot | undefined,
  result: AnalysisResult | undefined,
): Array<{ id: string; weight: number; met: boolean; label: readonly [string, string] }> {
  const location = asRecord(snapshot?.location);
  const reliable = readSources(snapshot?.sources).filter((source) => source.confidence === "HIGH" || source.confidence === "MEDIUM").length >= 2;
  return [
    { id: "location", weight: 15, met: typeof location?.latitude === "number", label: ["تحديد الموقع", "Location resolved"] as const },
    { id: "population", weight: 20, met: readMetric(snapshot?.population).value !== null, label: ["بيانات السكان", "Population data"] as const },
    { id: "purchasing", weight: 20, met: readMetric(snapshot?.purchasingPower).value !== null, label: ["القوة الشرائية", "Purchasing power"] as const },
    { id: "inflation", weight: 15, met: readMetric(snapshot?.costInflation).value !== null, label: ["تضخم التكلفة", "Cost inflation"] as const },
    { id: "competitors", weight: 15, met: result ? result.competitorCount !== null : false, label: ["رصد المنافسين", "Competitor coverage"] as const },
    { id: "sources", weight: 15, met: reliable, label: ["مصادر موثوقة", "Reliable sources"] as const },
  ];
}
