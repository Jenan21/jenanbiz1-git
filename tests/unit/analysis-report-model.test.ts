import { describe, expect, it } from "vitest";
import { buildReport, limitationText, localizeLimitations, NO_DATA_NOTE, reportNumber } from "@/lib/projects/analysis-report";
import { readStudy, type IntelligenceSnapshot } from "@/lib/projects/analysis-study";

const now = "2026-10-17T08:00:00.000Z";
const project = { id: "ckproject0000000000000001", name: "Coffee", sector: "Food", countryCode: "SA" };

const input = {
  idea: "منصة توصيل قهوة مختصة للمكاتب والشركات الناشئة في شمال الرياض",
  city: "الرياض",
  targetAudience: "BUSINESSES",
  latitude: 24.8216,
  longitude: 46.6633,
  expectedCapital: 500000,
  placeLabel: "الرياض - حي النرجس",
};
const result = {
  generatedAt: now,
  evidenceCompleteness: 85,
  competitionLevel: "MODERATE",
  purchasingPowerLevel: "HIGH",
  dataRiskLevel: "MODERATE",
  competitorCount: 2,
  sourceCount: 2,
  limitationCount: 1,
  recommendations: ["VALIDATE_MARKET_DEMAND", "DIFFERENTIATE_OFFER", "REVIEW_SOURCE_LIMITATIONS"],
};
const snapshot: IntelligenceSnapshot = {
  id: "s1",
  query: "الرياض",
  fetchedAt: now,
  location: { latitude: 24.8216, longitude: 46.6633, label: "الرياض" },
  population: { value: 36_947_025, year: 2024 },
  purchasingPower: { value: 58_000, year: 2024 },
  costInflation: { value: 1.7, year: 2024 },
  competitors: [
    { id: "a", name: "Near cafe", kind: "cafe", latitude: 24.8226, longitude: 46.6633 },
    { id: "b", name: "Far cafe", kind: "restaurant", latitude: 24.85, longitude: 46.7 },
  ],
  sources: [
    { source: "World Bank Open Data", retrievedAt: now, confidence: "HIGH" },
    { source: "OpenStreetMap Overpass", retrievedAt: now, confidence: "MEDIUM" },
  ],
  limitations: ["Competitor discovery could not be loaded: provider timeout 504 from overpass-api.de"],
};
const full = () => ({ project, study: readStudy({ status: "COMPLETED", updatedAt: now, input, result }), snapshot });

describe("report model", () => {
  it("marks every figure with its real state, source, date and confidence", () => {
    const model = buildReport(full(), "ar");
    const by = Object.fromEntries(model.indicators.map((item) => [item.id, item]));
    expect(model.indicators.map((item) => item.id)).toEqual(["population", "competitors", "purchasing", "inflation", "evidence", "risk"]);
    expect(by.population).toMatchObject({ state: "VERIFIED", confidence: "HIGH", date: "2024" });
    expect(by.population!.source).toContain("البنك الدولي");
    expect(by.competitors).toMatchObject({ state: "ESTIMATED", value: "2", confidence: "MEDIUM" });
    expect(by.purchasing).toMatchObject({ state: "ESTIMATED" });
    expect(by.evidence).toMatchObject({ state: "COMPUTED", value: "85%" });
    expect(model.complete).toBe(true);
    expect(model.pending.map((item) => item.id)).toEqual(["traffic", "demand", "opportunity"]);
  });

  it("gives each available indicator a compact note for the one-screen cards and keeps the count the map callout needs", () => {
    const ar = buildReport(full(), "ar");
    const by = Object.fromEntries(ar.indicators.map((item) => [item.id, item]));
    expect(ar.competitorCount).toBe(2);
    expect(by.competitors!.short).toBe("ضمن 5 كم · المنافسة متوسطة");
    expect(by.purchasing!.short).toContain("58,000");
    expect(buildReport(full(), "en").indicators.find((item) => item.id === "competitors")!.short).toBe("Within 5 km · competition Moderate");
    // An unavailable indicator never gets a made-up short note: it repeats its honest note.
    const empty = buildReport({ project, study: readStudy({ status: "COMPLETED", updatedAt: now, input }), snapshot: undefined }, "ar");
    expect(empty.competitorCount).toBeNull();
    for (const item of empty.indicators) expect(item.short).toBe(item.note);
  });

  it("never turns missing data into a number: it says unavailable and gives the Arabic no-data note", () => {
    const empty = { project, study: readStudy({ status: "COMPLETED", updatedAt: now, input }), snapshot: undefined };
    const model = buildReport(empty, "ar");
    expect(model.complete).toBe(false);
    for (const item of model.indicators) {
      expect(item.state).toBe("UNAVAILABLE");
      expect(item.value).toBe("غير متاح");
      expect(item.note).toBe(NO_DATA_NOTE[0]);
      expect(item.source).toBe("—");
    }
    expect(model.recommendations).toEqual([]);
    expect(model.standOut.competitors).toEqual([]);
  });

  it("does not show a provider name or a raw error to the reader", () => {
    const model = buildReport(full(), "ar");
    const everything = JSON.stringify(model);
    expect(everything).not.toMatch(/overpass-api|timeout|504|Nominatim|provider returned|could not be loaded/i);
    expect(model.risks.items).toEqual(["تضخم التكاليف السنوي 1.7% (2024، على مستوى الدولة)", "لا تتوفر بيانات موثوقة كافية عن المنافسين حاليًا."]);
    expect(limitationText("some brand new upstream failure", true)).toBe(NO_DATA_NOTE[0]);
    expect(limitationText("some brand new upstream failure", false)).toBe(NO_DATA_NOTE[1]);
  });

  it("folds three single-indicator lines into the whole-market line instead of repeating it", () => {
    const lines = localizeLimitations(
      [
        "Population, purchasing-power, and inflation data could not be loaded.",
        "Population result is unavailable.",
        "Purchasing-power result is unavailable.",
        "Cost inflation result is unavailable.",
      ],
      true,
    );
    expect(lines).toHaveLength(1);
  });

  it("sorts competitors by real distance from the chosen place and writes the distance in the reader's language", () => {
    const ar = buildReport(full(), "ar");
    expect(ar.standOut.competitors.map((item) => item.name)).toEqual(["Near cafe", "Far cafe"]);
    expect(ar.standOut.competitors[0]!.distance).toMatch(/م$/);
    expect(ar.standOut.competitors[1]!.distance).toMatch(/كم$/);
    const en = buildReport(full(), "en");
    expect(en.standOut.competitors[0]!.distance).toMatch(/ m$/);
    expect(en.standOut.competitors[0]!.category).toBe("Café");
  });

  it("gives every recommendation a reason and the inputs it rests on", () => {
    const model = buildReport(full(), "en");
    expect(model.recommendations.map((item) => item.code)).toEqual(["VALIDATE_MARKET_DEMAND", "DIFFERENTIATE_OFFER", "REVIEW_SOURCE_LIMITATIONS"]);
    for (const item of model.recommendations) {
      expect(item.reason.length).toBeGreaterThan(10);
      expect(item.basis.length).toBeGreaterThan(0);
    }
    expect(model.recommendations[1]!.reason).toContain("2 venues mapped within 5 km");
  });

  it("writes numbers with Latin digits, compact above a million, and dates in Riyadh time", () => {
    expect(reportNumber(36_947_025, "en")).toBe("36.9M");
    expect(reportNumber(36_947_025, "ar")).toContain("36.9");
    expect(reportNumber(500_000, "ar")).toBe("500,000");
    expect(buildReport(full(), "en").generatedAtLabel).toContain("2026");
    expect(buildReport(full(), "en").generatedAtLabel).toContain("11:00");
  });

  it("includes the area only when one was given, and keeps the full idea untouched", () => {
    const withArea = buildReport({ ...full(), study: readStudy({ status: "COMPLETED", updatedAt: now, input: { ...input, areaSqm: 150 }, result }) }, "ar");
    expect(withArea.facts.map((fact) => fact.id)).toContain("area");
    expect(buildReport(full(), "ar").facts.map((fact) => fact.id)).not.toContain("area");
    expect(buildReport(full(), "ar").facts[0]!.value).toBe(input.idea);
  });
});
