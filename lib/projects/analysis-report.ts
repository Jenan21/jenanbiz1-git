import {
  asRecord,
  audienceLabels,
  cityLabels,
  readCompetitors,
  readLimitations,
  readMetric,
  readSources,
  resultRecommendations,
  type AnalysisStudy,
  type IntelligenceSnapshot,
} from "@/lib/projects/analysis-study";
import { FLOW_SECTORS } from "@/lib/projects/flow-options";
import { textProblem, textProblemMessage } from "@/lib/projects/text-quality";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];
const pick = (copy: Copy, ar: boolean) => (ar ? copy[0] : copy[1]);

export type MetricState = "VERIFIED" | "ESTIMATED" | "UNAVAILABLE" | "COMPUTED";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type IndicatorId = "population" | "competitors" | "purchasing" | "inflation" | "evidence" | "risk";

/** What the reader sees when a figure cannot be shown; it never names a provider or quotes an error. */
export const NO_DATA_NOTE: Copy = ["لا تتوفر بيانات موثوقة كافية لهذا المؤشر حاليًا", "Reliable data is not available for this indicator right now"];

const STATE_LABELS: Record<MetricState, Copy> = {
  VERIFIED: ["موثّق", "Verified"],
  ESTIMATED: ["تقديري", "Estimated"],
  UNAVAILABLE: ["غير متاح", "Unavailable"],
  COMPUTED: ["محسوب", "Computed"],
};
const CONFIDENCE_LABELS: Record<Confidence, Copy> = {
  HIGH: ["ثقة مرتفعة", "High confidence"],
  MEDIUM: ["ثقة متوسطة", "Medium confidence"],
  LOW: ["ثقة منخفضة", "Low confidence"],
};

export const stateLabel = (state: MetricState, ar: boolean) => pick(STATE_LABELS[state], ar);
export const confidenceLabel = (confidence: Confidence | undefined, ar: boolean) => (confidence ? pick(CONFIDENCE_LABELS[confidence], ar) : "—");

/* ------------------------------------------------------------------ limitations */

const LIMITATIONS: ReadonlyArray<readonly [RegExp, Copy, string?]> = [
  [/location provider returned no matching result/i, ["لم يُعثر على نتيجة مطابقة للموقع المحدد.", "No matching result was found for the chosen location."]],
  [/geocoding could not be loaded/i, ["تعذر تحديد اسم الموقع في الوقت الحالي.", "The place name could not be resolved right now."]],
  [/population, purchasing-power, and inflation data could not be loaded/i, ["لا تتوفر بيانات موثوقة كافية للسكان والقوة الشرائية والتضخم حاليًا.", "Reliable population, purchasing-power and inflation data is not available right now."], "market"],
  [/two-letter country code is required/i, ["لا تتوفر بيانات السكان والقوة الشرائية لأن الدولة غير محددة.", "Population and purchasing-power data is unavailable because no country is set."], "market"],
  [/resolvable location is required for competitor discovery/i, ["يلزم موقع محدد بدقة لرصد المنافسين.", "A precisely resolved location is needed to find competitors."]],
  [/sector with a known map category/i, ["لا يوجد تصنيف خرائطي لهذا القطاع، لذلك لا يُعرض عدد للمنافسين.", "This sector has no map category, so no competitor count is shown."]],
  [/no venues of this sector are mapped within 5 km/i, ["لم تُرصد منشآت لهذا النشاط ضمن 5 كم على الخريطة؛ وهذا لا يعني عدم وجود منافسة.", "No venues of this activity are mapped within 5 km; that does not mean there is no competition."]],
  [/competitor discovery could not be loaded/i, ["لا تتوفر بيانات موثوقة كافية عن المنافسين حاليًا.", "Reliable competitor data is not available right now."]],
  [/population result is unavailable/i, ["لا تتوفر بيانات موثوقة كافية لعدد السكان حاليًا.", "Reliable population data is not available right now."], "population"],
  [/purchasing-power result is unavailable/i, ["لا تتوفر بيانات موثوقة كافية للقوة الشرائية حاليًا.", "Reliable purchasing-power data is not available right now."], "purchasing"],
  [/cost inflation result is unavailable/i, ["لا تتوفر بيانات موثوقة كافية لتضخم التكاليف حاليًا.", "Reliable cost-inflation data is not available right now."], "inflation"],
];

/** A recorded limitation as the reader should see it; an unknown one reads as the generic no-data note, never as raw text. */
export function limitationText(raw: string, ar: boolean) {
  const known = LIMITATIONS.find(([pattern]) => pattern.test(raw));
  return pick(known ? known[1] : NO_DATA_NOTE, ar);
}

/**
 * The limitations without repeats. When the market data failed as a whole, the three single-indicator lines say the same
 * thing again, so they are folded into it.
 */
export function localizeLimitations(raw: readonly string[], ar: boolean) {
  const wholeMarketFailed = raw.some((item) => LIMITATIONS.some(([pattern, , group]) => group === "market" && pattern.test(item)));
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of raw) {
    const known = LIMITATIONS.find(([pattern]) => pattern.test(item));
    if (wholeMarketFailed && known && ["population", "purchasing", "inflation"].includes(known[2] ?? "")) continue;
    const text = limitationText(item, ar);
    if (seen.has(text)) continue;
    seen.add(text);
    lines.push(text);
  }
  return lines;
}

/* ------------------------------------------------------------------ sources */

const SOURCES: Record<string, { name: Copy; short: Copy; covers: Copy }> = {
  "World Bank Open Data": {
    name: ["البنك الدولي — مؤشرات التنمية", "World Bank — development indicators"],
    short: ["البنك الدولي", "World Bank"],
    covers: ["السكان والقوة الشرائية والتضخم على مستوى الدولة", "Population, purchasing power and inflation at country level"],
  },
  "OpenStreetMap Overpass": {
    name: ["OpenStreetMap — المنشآت المرصودة", "OpenStreetMap — mapped venues"],
    short: ["OpenStreetMap", "OpenStreetMap"],
    covers: ["المنافسون المرصودون ضمن 5 كم", "Competitors mapped within 5 km"],
  },
  "OpenStreetMap Nominatim": {
    name: ["OpenStreetMap — المواقع", "OpenStreetMap — places"],
    short: ["OpenStreetMap", "OpenStreetMap"],
    covers: ["تحديد الموقع والعنوان", "Location and address"],
  },
};

/* ------------------------------------------------------------------ formatting */

const tag = (locale: Locale) => (locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");

/** A counted noun in the reader's language, with the Arabic number rules (one, two, a few, many) written out. */
export function countedText(count: number, forms: { en: [string, string]; ar: { one: string; two: string; few: string; many: string } }, locale: Locale) {
  const n = new Intl.NumberFormat(tag(locale)).format(count);
  if (locale !== "ar") return count === 1 ? `1 ${forms.en[0]}` : `${n} ${forms.en[1]}`;
  if (count === 1) return forms.ar.one;
  if (count === 2) return forms.ar.two;
  return count >= 3 && count <= 10 ? `${n} ${forms.ar.few}` : `${n} ${forms.ar.many}`;
}

export const venuesText = (count: number, locale: Locale) =>
  countedText(count, { en: ["venue", "venues"], ar: { one: "منشأة واحدة", two: "منشأتان", few: "منشآت", many: "منشأة" } }, locale);
export const limitsText = (count: number, locale: Locale) =>
  countedText(count, { en: ["data limit", "data limits"], ar: { one: "قيد واحد على البيانات", two: "قيدان على البيانات", few: "قيود على البيانات", many: "قيدًا على البيانات" } }, locale);

export function reportNumber(value: number, locale: Locale, maximumFractionDigits = 0) {
  const compact = Math.abs(value) >= 1_000_000;
  return new Intl.NumberFormat(tag(locale), {
    maximumFractionDigits: compact ? Math.max(1, maximumFractionDigits) : maximumFractionDigits,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

/** Gregorian date and time in Riyadh, so a page rendered on the server and in the browser read the same. */
export function reportDate(value: string | undefined, locale: Locale, withTime = true) {
  if (!value) return locale === "ar" ? "غير متاح" : "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === "ar" ? "غير متاح" : "Unavailable";
  const day = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { day: "numeric", month: locale === "ar" ? "long" : "short", timeZone: "Asia/Riyadh", year: "numeric" }).format(date);
  if (!withTime) return day;
  const time = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(date);
  return `${day} · ${time}`;
}

function reportMoney(value: number | undefined, locale: Locale) {
  if (value === undefined) return locale === "ar" ? "غير محدد" : "Not specified";
  return `${new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 0 }).format(value)} ${locale === "ar" ? "ريال" : "SAR"}`;
}

/** Straight-line distance in kilometres between two coordinates. */
export function distanceKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a = Math.sin(radians(to.latitude - from.latitude) / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(radians(to.longitude - from.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function distanceText(km: number | null, locale: Locale) {
  if (km === null) return "—";
  if (km < 1) return `${Math.max(10, Math.round(km * 100) * 10)} ${locale === "ar" ? "م" : "m"}`;
  return `${new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 1 }).format(km)} ${locale === "ar" ? "كم" : "km"}`;
}

const CATEGORIES: Record<string, Copy> = {
  restaurant: ["مطعم", "Restaurant"], cafe: ["مقهى", "Café"], fast_food: ["وجبات سريعة", "Fast food"], food_court: ["ساحة مطاعم", "Food court"],
  bakery: ["مخبز", "Bakery"], pastry: ["حلويات", "Pastry"], coffee: ["قهوة", "Coffee"], supermarket: ["سوبرماركت", "Supermarket"],
  convenience: ["بقالة", "Convenience store"], greengrocer: ["خضار وفواكه", "Greengrocer"], pharmacy: ["صيدلية", "Pharmacy"], clinic: ["عيادة", "Clinic"],
  doctors: ["عيادة طبية", "Doctor"], dentist: ["عيادة أسنان", "Dentist"], hospital: ["مستشفى", "Hospital"], school: ["مدرسة", "School"],
  college: ["كلية", "College"], kindergarten: ["روضة", "Kindergarten"], language_school: ["معهد لغات", "Language school"], training: ["مركز تدريب", "Training centre"],
  fitness_centre: ["نادٍ رياضي", "Fitness centre"], sports_centre: ["مركز رياضي", "Sports centre"], hairdresser: ["صالون", "Salon"], beauty: ["مركز تجميل", "Beauty centre"],
  cosmetics: ["مستحضرات تجميل", "Cosmetics"], hotel: ["فندق", "Hotel"], hostel: ["نُزل", "Hostel"], guest_house: ["بيت ضيافة", "Guest house"],
  apartment: ["شقق مفروشة", "Serviced apartments"], car: ["معرض سيارات", "Car dealer"], car_repair: ["ورشة سيارات", "Car repair"], car_parts: ["قطع غيار", "Car parts"],
  car_wash: ["غسيل سيارات", "Car wash"], estate_agent: ["مكتب عقاري", "Estate agent"], shop: ["متجر", "Shop"], office: ["مكتب", "Office"],
};

export function categoryLabel(raw: string | undefined, ar: boolean) {
  const key = raw?.trim().toLowerCase();
  const known = key ? CATEGORIES[key] : undefined;
  if (known) return pick(known, ar);
  if (ar || !key) return ar ? "منشأة" : "Venue";
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

/* ------------------------------------------------------------------ the model */

export type ReportData = {
  project: { id: string; name: string; sector?: string | null; countryCode?: string | null };
  study: AnalysisStudy;
  snapshot?: IntelligenceSnapshot;
};

export type ReportFact = { id: "idea" | "location" | "capital" | "audience" | "sector" | "area"; label: string; value: string };
export type ReportIndicator = {
  id: IndicatorId;
  label: string;
  value: string;
  note: string;
  state: MetricState;
  stateLabel: string;
  tone?: "LOW" | "MODERATE" | "HIGH" | "UNAVAILABLE";
  source: string;
  date: string;
  confidence?: Confidence;
  confidenceLabel: string;
};
export type ReportPending = { id: "traffic" | "demand" | "opportunity"; label: string; reason: string };
export type ReportRecommendation = { code: string; title: string; text: string; reason: string; basis: string[] };
export type ReportCompetitor = { name: string; category: string; distance: string; km: number | null };
export type ReportSourceRow = { name: string; covers: string; date: string; confidence: string };

export type ReportModel = {
  locale: Locale;
  projectId: string;
  title: string;
  generatedAt: string;
  generatedAtLabel: string;
  /** False for a partial report: the location data exists but the analysis itself has not finished. */
  complete: boolean;
  completeness: number;
  /** The mapped competitors counted within 5 km; null when no competitor source answered. */
  competitorCount: number | null;
  quality: "LOW" | "MODERATE" | "HIGH";
  qualityLabel: string;
  facts: ReportFact[];
  /** Set when the saved idea is gibberish: the figures then describe the place only and must not be read as a project's. */
  ideaWarning: string | null;
  indicators: ReportIndicator[];
  pending: ReportPending[];
  recommendations: ReportRecommendation[];
  standOut: { positioning: string | null; competitors: ReportCompetitor[]; empty: string };
  risks: { level: "LOW" | "MODERATE" | "HIGH" | "UNAVAILABLE"; levelLabel: string; items: string[]; empty: string };
  sources: ReportSourceRow[];
  place: { name: string; latitude?: number; longitude?: number; coordinates: string };
  mapCompetitors: Array<{ name: string; category: string; latitude: number; longitude: number }>;
  disclaimer: string;
};

const RECOMMENDATION_TITLES: Record<string, Copy> = {
  VALIDATE_MARKET_DEMAND: ["تحقق من الطلب قبل الاستثمار", "Check demand before investing"],
  DIFFERENTIATE_OFFER: ["ابنِ عرضًا يميّزك عن المنافسين", "Build an offer that sets you apart"],
  OBTAIN_LOCAL_PURCHASING_DATA: ["أضف بيانات محلية للقوة الشرائية", "Add local purchasing-power data"],
  VERIFY_LOCATION: ["راجع الموقع المحدد", "Review the chosen location"],
  REVIEW_SOURCE_LIMITATIONS: ["عالج فجوات البيانات", "Close the data gaps"],
  PROCEED_TO_DETAILED_FEASIBILITY: ["انتقل إلى دراسة الجدوى", "Move on to the feasibility study"],
};

/** Which real inputs a recommendation rests on; the day an engine writes location-specific advice it fills the same slots. */
const RECOMMENDATION_BASIS: Record<string, string[]> = {
  VALIDATE_MARKET_DEMAND: ["activity", "location"],
  DIFFERENTIATE_OFFER: ["competitors", "activity"],
  OBTAIN_LOCAL_PURCHASING_DATA: ["market", "location"],
  VERIFY_LOCATION: ["location"],
  REVIEW_SOURCE_LIMITATIONS: ["market"],
  PROCEED_TO_DETAILED_FEASIBILITY: ["market"],
};

export const BASIS_LABELS: Record<string, Copy> = {
  location: ["الموقع", "Location"],
  activity: ["النشاط", "Activity"],
  competitors: ["المنافسين", "Competitors"],
  market: ["بيانات السوق", "Market data"],
};

const DISCLAIMER: Copy = [
  "تصف هذه المؤشرات الموقع والدولة (السكان، القوة الشرائية، التضخم، والمنشآت المرصودة على الخريطة) ولا تُقيّم فكرة المشروع نفسها ولا تمثل دراسة جدوى. كل رقم مرتبط بمصدره وتاريخه ودرجة الثقة فيه.",
  "These indicators describe the location and country (population, purchasing power, inflation and venues mapped nearby). They do not evaluate the project idea itself and are not a feasibility study. Every figure is tied to its source, date and confidence.",
];

export function buildReport(data: ReportData, locale: Locale): ReportModel {
  const ar = locale === "ar";
  const { project, study, snapshot } = data;
  const input = study.input;
  const result = study.result;

  const location = asRecord(snapshot?.location);
  const latitude = typeof location?.latitude === "number" ? location.latitude : input?.latitude;
  const longitude = typeof location?.longitude === "number" ? location.longitude : input?.longitude;
  const city = input ? (cityLabels[input.city] ? pick(cityLabels[input.city]!, ar) : input.city) : "—";
  const placeName = input?.placeLabel ?? city;
  const hasPoint = latitude !== undefined && longitude !== undefined;

  const population = readMetric(snapshot?.population);
  const purchasing = readMetric(snapshot?.purchasingPower);
  const inflation = readMetric(snapshot?.costInflation);
  const competitors = readCompetitors(snapshot?.competitors);
  const sources = readSources(snapshot?.sources);
  const rawLimitations = readLimitations(snapshot?.limitations);
  const limitations = localizeLimitations(rawLimitations, ar);

  const worldBank = sources.find((item) => item.source === "World Bank Open Data");
  const venues = sources.find((item) => item.source === "OpenStreetMap Overpass");
  const sourceName = (name: string) => (SOURCES[name] ? pick(SOURCES[name].name, ar) : name);
  const sourceShort = (name: string) => (SOURCES[name] ? pick(SOURCES[name].short, ar) : name);
  const competitorCount = result ? result.competitorCount : competitors.length ? competitors.length : null;
  const completeness = result?.evidenceCompleteness ?? 0;
  const quality: "LOW" | "MODERATE" | "HIGH" = completeness >= 70 ? "HIGH" : completeness >= 45 ? "MODERATE" : "LOW";
  const level = (value: string | undefined) => ({ LOW: ["منخفضة", "Low"], MODERATE: ["متوسطة", "Moderate"], HIGH: ["مرتفعة", "High"] } as Record<string, Copy>)[value ?? ""];
  const levelText = (value: string | undefined, fallback: Copy = ["غير متاح", "Unavailable"]) => pick(level(value) ?? fallback, ar);
  const yearOf = (metric: { period?: string }, fetched?: string) => metric.period ?? (fetched ? reportDate(fetched, locale, false) : "—");
  const noData = pick(NO_DATA_NOTE, ar);

  const indicator = (item: Omit<ReportIndicator, "stateLabel" | "confidenceLabel">): ReportIndicator => ({
    ...item,
    stateLabel: stateLabel(item.state, ar),
    confidenceLabel: confidenceLabel(item.confidence, ar),
  });

  const indicators: ReportIndicator[] = [
    population.value !== null
      ? indicator({
          id: "population", label: pick(["عدد السكان", "Population"], ar), value: reportNumber(population.value, locale),
          note: pick(["على مستوى الدولة", "Country level"], ar), state: "VERIFIED", source: sourceShort("World Bank Open Data"),
          date: yearOf(population, worldBank?.retrievedAt), confidence: worldBank?.confidence,
        })
      : indicator({ id: "population", label: pick(["عدد السكان", "Population"], ar), value: pick(["غير متاح", "Unavailable"], ar), note: noData, state: "UNAVAILABLE", source: "—", date: "—" }),
    competitorCount !== null
      ? indicator({
          id: "competitors", label: pick(["المنافسون", "Competitors"], ar), value: reportNumber(competitorCount, locale),
          note: pick([`عدد المنشآت المرصودة ضمن 5 كم · المنافسة ${levelText(result?.competitionLevel)}`, `venues mapped within 5 km · competition ${levelText(result?.competitionLevel)}`], ar),
          state: "ESTIMATED", tone: result?.competitionLevel, source: sourceShort("OpenStreetMap Overpass"),
          date: reportDate(venues?.retrievedAt, locale, false), confidence: venues?.confidence,
        })
      : indicator({ id: "competitors", label: pick(["المنافسون", "Competitors"], ar), value: pick(["غير متاح", "Unavailable"], ar), note: noData, state: "UNAVAILABLE", source: "—", date: "—" }),
    purchasing.value !== null
      ? indicator({
          id: "purchasing", label: pick(["القوة الشرائية", "Purchasing power"], ar), value: levelText(result?.purchasingPowerLevel),
          note: pick([`دخل الفرد ${reportNumber(purchasing.value, locale)} دولارًا دوليًا · على مستوى الدولة`, `Income per person ${reportNumber(purchasing.value, locale)} international $ · country level`], ar),
          state: "ESTIMATED", tone: result?.purchasingPowerLevel, source: sourceShort("World Bank Open Data"),
          date: yearOf(purchasing, worldBank?.retrievedAt), confidence: worldBank?.confidence,
        })
      : indicator({ id: "purchasing", label: pick(["القوة الشرائية", "Purchasing power"], ar), value: pick(["غير متاح", "Unavailable"], ar), note: noData, state: "UNAVAILABLE", source: "—", date: "—" }),
    inflation.value !== null
      ? indicator({
          id: "inflation", label: pick(["تضخم التكاليف", "Cost inflation"], ar), value: `${reportNumber(inflation.value, locale, 1)}%`,
          note: pick(["تضخم أسعار المستهلك السنوي · الدولة", "Annual consumer-price inflation · country"], ar), state: "VERIFIED",
          source: sourceShort("World Bank Open Data"), date: yearOf(inflation, worldBank?.retrievedAt), confidence: worldBank?.confidence,
        })
      : indicator({ id: "inflation", label: pick(["تضخم التكاليف", "Cost inflation"], ar), value: pick(["غير متاح", "Unavailable"], ar), note: noData, state: "UNAVAILABLE", source: "—", date: "—" }),
    result
      ? indicator({
          id: "evidence", label: pick(["اكتمال الأدلة", "Evidence coverage"], ar), value: `${completeness}%`,
          note: pick([`جودة التغطية ${levelText(quality)}`, `Coverage quality ${levelText(quality)}`], ar), state: "COMPUTED", tone: quality,
          source: pick(["حساب المنصة", "Platform calculation"], ar), date: reportDate(result.generatedAt || study.updatedAt, locale, false), confidence: undefined,
        })
      : indicator({ id: "evidence", label: pick(["اكتمال الأدلة", "Evidence coverage"], ar), value: pick(["غير متاح", "Unavailable"], ar), note: noData, state: "UNAVAILABLE", source: "—", date: "—" }),
    result
      ? indicator({
          id: "risk", label: pick(["مخاطر البيانات", "Data risk"], ar), value: levelText(result.dataRiskLevel),
          note: limitations.length ? limitsText(limitations.length, locale) : pick(["لا قيود مسجلة", "No limits recorded"], ar),
          state: "COMPUTED", tone: result.dataRiskLevel, source: pick(["حساب المنصة", "Platform calculation"], ar), date: reportDate(result.generatedAt || study.updatedAt, locale, false), confidence: undefined,
        })
      : indicator({ id: "risk", label: pick(["مخاطر البيانات", "Data risk"], ar), value: pick(["غير متاح", "Unavailable"], ar), note: noData, state: "UNAVAILABLE", source: "—", date: "—" }),
  ];

  const pending: ReportPending[] = [
    { id: "traffic", label: pick(["حركة المرور", "Traffic"], ar), reason: pick(["لا يوجد مصدر بيانات متاح", "No data source is available"], ar) },
    { id: "demand", label: pick(["الطلب المتوقع", "Expected demand"], ar), reason: pick(["يتطلب دراسة جدوى", "Needs a feasibility study"], ar) },
    { id: "opportunity", label: pick(["فرصة السوق", "Market opportunity"], ar), reason: pick(["يتطلب دراسة جدوى", "Needs a feasibility study"], ar) },
  ];

  const reasonFor = (code: string) => {
    if (code === "DIFFERENTIATE_OFFER") {
      return competitorCount !== null
        ? pick([`رُصد ضمن 5 كم من ${placeName}: ${venuesText(competitorCount, locale)}.`, `${venuesText(competitorCount, locale)} mapped within 5 km of ${placeName}.`], ar)
        : pick(["تشير بيانات المنافسين إلى سوق يحتاج تموضعًا أدق.", "Competitor data points to a market that needs sharper positioning."], ar);
    }
    if (code === "OBTAIN_LOCAL_PURCHASING_DATA") {
      return purchasing.value === null
        ? pick(["لا تتوفر بيانات موثوقة كافية للقوة الشرائية حاليًا.", "Reliable purchasing-power data is not available right now."], ar)
        : pick(["المؤشر المتاح يصف الدولة كلها لا المنطقة المحيطة بالموقع.", "The available figure describes the whole country, not the area around the location."], ar);
    }
    if (code === "VERIFY_LOCATION") return pick(["لم يتحدد الموقع بدقة كافية لرصد المنافسين.", "The location was not precise enough to find competitors."], ar);
    if (code === "REVIEW_SOURCE_LIMITATIONS") {
      return pick([`سُجّل على بيانات هذا التقرير: ${limitsText(limitations.length, locale)}، وهي موضحة في قسم المخاطر.`, `Recorded on this report's data: ${limitsText(limitations.length, locale)}; see the risks section.`], ar);
    }
    if (code === "PROCEED_TO_DETAILED_FEASIBILITY") {
      return pick(
        [
          `اكتمال الأدلة ${completeness}% (تغطية ${levelText(quality)})${limitations.length ? `، مع ${limitsText(limitations.length, locale)} مسجّلة` : ""}.`,
          `Evidence coverage is ${completeness}% (${levelText(quality)} quality)${limitations.length ? `, with ${limitsText(limitations.length, locale)} recorded` : ""}.`,
        ],
        ar,
      );
    }
    return pick(["لا يتوفر مؤشر طلب موثق لهذا الموقع والنشاط في مصادر التحليل الحالية.", "No verified demand indicator exists for this location and activity in the current sources."], ar);
  };

  const recommendations: ReportRecommendation[] = (result?.recommendations ?? [])
    .filter((code) => resultRecommendations[code])
    .map((code) => ({
      code,
      title: pick(RECOMMENDATION_TITLES[code] ?? ["توصية", "Recommendation"], ar),
      text: pick(resultRecommendations[code]!, ar),
      reason: reasonFor(code),
      basis: (RECOMMENDATION_BASIS[code] ?? []).map((key) => pick(BASIS_LABELS[key]!, ar)),
    }));

  const origin = hasPoint ? { latitude: latitude as number, longitude: longitude as number } : null;
  const nearby: ReportCompetitor[] = competitors
    .filter((item): item is typeof item & { latitude: number; longitude: number } => typeof item.latitude === "number" && typeof item.longitude === "number")
    .map((item) => {
      const km = origin ? distanceKm(origin, { latitude: item.latitude, longitude: item.longitude }) : (item.distanceKm ?? null);
      return {
        name: item.name ?? pick(["دون اسم", "Unnamed"], ar),
        category: categoryLabel(item.kind, ar),
        km,
        distance: distanceText(km, locale),
      };
    })
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));

  const positioning = recommendations.find((item) => item.code === "DIFFERENTIATE_OFFER");
  const sectorItem = FLOW_SECTORS.find((item) => item.value === project.sector);

  const facts: ReportFact[] = [
    { id: "idea", label: pick(["فكرة المشروع", "Project idea"], ar), value: input?.idea ?? project.name },
    { id: "location", label: pick(["الموقع", "Location"], ar), value: placeName },
    { id: "capital", label: pick(["رأس المال المتوقع", "Expected capital"], ar), value: reportMoney(input?.expectedCapital, locale) },
    { id: "audience", label: pick(["الفئة المستهدفة", "Target audience"], ar), value: input && audienceLabels[input.targetAudience] ? pick(audienceLabels[input.targetAudience]!, ar) : "—" },
    { id: "sector", label: pick(["القطاع", "Sector"], ar), value: sectorItem ? pick(sectorItem.label, ar) : (project.sector ?? pick(["غير محدد", "Not specified"], ar)) },
    ...(input?.areaSqm ? [{ id: "area" as const, label: pick(["المساحة", "Area"], ar), value: `${reportNumber(input.areaSqm, locale)} ${pick(["متر مربع", "m²"], ar)}` }] : []),
  ];

  const sourceRows: ReportSourceRow[] = [
    ...sources.map((item) => ({
      name: item.source ? sourceName(item.source) : pick(["مصدر بيانات", "Data source"], ar),
      covers: item.source && SOURCES[item.source] ? pick(SOURCES[item.source]!.covers, ar) : "—",
      date: reportDate(item.retrievedAt, locale),
      confidence: confidenceLabel(item.confidence, ar),
    })),
    ...(result
      ? [{
          name: pick(["حساب المنصة", "Platform calculation"], ar),
          covers: pick(["اكتمال الأدلة ومستوى مخاطر البيانات والتوصيات", "Evidence coverage, data risk and recommendations"], ar),
          date: reportDate(result.generatedAt || study.updatedAt, locale),
          confidence: "—",
        }]
      : []),
  ];

  const generatedAt = result?.generatedAt || study.updatedAt || "";
  const problem = input ? textProblem(input.idea) : null;
  const ideaWarning = problem
    ? pick([
        `فكرة هذا المشروع غير مفهومة: ${textProblemMessage(problem, "ar")} الأرقام أدناه تخص الموقع فقط ولا تمثل مشروعًا حقيقيًا، فلا تعتمد عليها. ابدأ تحليلًا جديدًا بوصف حقيقي لفكرتك.`,
        `This project's idea is not understandable: ${textProblemMessage(problem, "en")} The figures below describe the location only and do not represent a real project, so do not rely on them. Start a new analysis with a real description.`,
      ], ar)
    : null;
  return {
    locale,
    projectId: project.id,
    title: pick(["تقرير تحليل المشروع", "Project analysis report"], ar),
    generatedAt,
    generatedAtLabel: reportDate(generatedAt, locale),
    complete: Boolean(result),
    completeness,
    competitorCount,
    quality,
    qualityLabel: levelText(quality),
    facts,
    ideaWarning,
    indicators,
    pending,
    recommendations,
    standOut: {
      positioning: positioning ? `${positioning.title}. ${positioning.reason}` : null,
      competitors: nearby,
      empty: noData,
    },
    risks: {
      level: result?.dataRiskLevel ?? "UNAVAILABLE",
      levelLabel: result ? levelText(result.dataRiskLevel) : pick(["غير متاح", "Unavailable"], ar),
      items: limitations,
      empty: pick(["لا توجد قيود إضافية مسجلة على البيانات.", "No additional data limits are recorded."], ar),
    },
    sources: sourceRows,
    place: {
      name: placeName,
      latitude: origin?.latitude,
      longitude: origin?.longitude,
      coordinates: origin ? `${origin.latitude.toFixed(5)}, ${origin.longitude.toFixed(5)}` : "—",
    },
    mapCompetitors: nearby.length
      ? competitors
          .filter((item): item is typeof item & { latitude: number; longitude: number } => typeof item.latitude === "number" && typeof item.longitude === "number")
          .map((item) => ({ name: item.name ?? pick(["دون اسم", "Unnamed"], ar), category: categoryLabel(item.kind, ar), latitude: item.latitude, longitude: item.longitude }))
      : [],
    disclaimer: pick(DISCLAIMER, ar),
  };
}
