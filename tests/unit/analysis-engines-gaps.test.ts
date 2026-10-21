import { describe, expect, it } from "vitest";
import {
  catalogProblems, combineGapCatalogs, createGap, deriveInputGaps, gapSchema, gapSeverities, hasGap, isNormalizedGapList, normalizeGaps, placeholdersOf, sharedGapCatalog, summarizeGaps,
  type Gap, type GapCatalog,
} from "@/services/analysis-engines/shared";
import { makeEngineRunInput, makeInput, makeUnregisteredSampleInput, verdictArabic, verdictEnglish } from "./support/analysis-engine-fixtures";

describe("shared gap catalog", () => {
  it("is structurally sound: valid codes, severities, both languages, matching placeholders", () => {
    expect(catalogProblems(sharedGapCatalog)).toEqual([]);
    expect(Object.keys(sharedGapCatalog).length).toBeGreaterThanOrEqual(22);
    for (const severity of gapSeverities) expect(Object.values(sharedGapCatalog).some((definition) => definition.severity === severity)).toBe(true);
  });

  it("writes Arabic in Arabic and English in English, with no stray whitespace", () => {
    for (const [code, definition] of Object.entries(sharedGapCatalog)) {
      for (const field of ["message", "remedy"] as const) {
        expect(definition[field].ar, `${code}.${field}.ar`).toMatch(/[\u0600-\u06FF]/);
        expect(definition[field].en, `${code}.${field}.en`).toMatch(/[A-Za-z]/);
        expect(definition[field].ar).toBe(definition[field].ar.trim());
        expect(definition[field].en).toBe(definition[field].en.trim());
      }
    }
  });

  it("never judges a location or states a probability, and never prints a percentage", () => {
    for (const [code, definition] of Object.entries(sharedGapCatalog)) {
      for (const value of [definition.message.en, definition.remedy.en]) { expect(value, code).not.toMatch(verdictEnglish); expect(value, code).not.toContain("%"); }
      for (const value of [definition.message.ar, definition.remedy.ar]) { expect(value, code).not.toMatch(verdictArabic); expect(value, code).not.toContain("٪"); }
    }
  });

  it("never lets absence read as zero: every no-data gap says unknown, unavailable or not used", () => {
    expect(sharedGapCatalog.NO_COVERAGE.message.en).toContain("unknown, not zero");
    expect(sharedGapCatalog.COUNT_IS_NOT_AN_INVENTORY.message.en).toContain("not a complete inventory");
    expect(sharedGapCatalog.DATA_EXPIRED.message.en).toContain("not used");
  });
});

describe("createGap", () => {
  it("renders both languages from the catalog entry and records the severity", () => {
    const gap = createGap(sharedGapCatalog, "NO_COVERAGE", { dataset: "Hospitals atlas" }, { inputId: "dc:version-1", subject: "poi:hospital" });
    expect(gap).toMatchObject({ code: "NO_COVERAGE", severity: "BLOCKING", inputId: "dc:version-1", subject: "poi:hospital" });
    expect(gap.message.en).toBe("The requested location is outside the declared coverage of “Hospitals atlas”; the value is unknown, not zero.");
    expect(gap.message.ar).toContain("«Hospitals atlas»");
    expect(gapSchema.parse(gap)).toEqual(gap);
  });

  it("omits the optional references when they are not given", () => {
    const gap = createGap(sharedGapCatalog, "COUNT_IS_NOT_AN_INVENTORY");
    expect("inputId" in gap).toBe(false);
    expect("subject" in gap).toBe(false);
  });

  it("renders numbers and ignores parameters the template does not use", () => {
    expect(createGap(sharedGapCatalog, "RESULT_TRUNCATED", { limit: 20, unused: "x" }).message.en).toContain("(20)");
  });

  it("throws instead of printing a hole when a parameter is missing", () => {
    expect(() => createGap(sharedGapCatalog, "NO_COVERAGE")).toThrow('needs the parameter "dataset"');
    expect(() => createGap(sharedGapCatalog, "FALLBACK_APPLIED", { from: "A" })).toThrow('needs the parameter "to"');
  });

  it("does not read inherited properties as parameters or codes", () => {
    expect(() => createGap(sharedGapCatalog, "NO_COVERAGE", Object.create({ dataset: "x" }) as Record<string, string>)).toThrow(/needs the parameter/);
    expect(() => createGap(sharedGapCatalog, "constructor" as never)).toThrow(/Unknown gap code/);
  });

  it("rejects a non-finite number parameter", () => {
    expect(() => createGap(sharedGapCatalog, "RESULT_TRUNCATED", { limit: Number.NaN })).toThrow(/not finite/);
  });

  it("does not render placeholders that appear inside a parameter value", () => {
    expect(createGap(sharedGapCatalog, "DATA_STALE", { dataset: "{role}" }).message.en).toContain("“{role}”");
  });
});

describe("normalizeGaps", () => {
  const gap = (code: keyof typeof sharedGapCatalog, reference: { inputId?: string; subject?: string } = {}) =>
    createGap(sharedGapCatalog, code, { dataset: "D", role: "r", limit: 1, backend: "b", from: "f", to: "t", assumption: "a" }, reference);

  it("orders by severity, then code, input and subject", () => {
    const sorted = normalizeGaps([gap("ATTRIBUTION_REQUIRED", { inputId: "b" }), gap("DATA_STALE", { inputId: "b" }), gap("NO_COVERAGE", { inputId: "z" }), gap("DATA_STALE", { inputId: "a" }), gap("DATASET_NOT_AVAILABLE", { subject: "poi:school" })]);
    expect(sorted.map((entry) => `${entry.severity}:${entry.code}:${entry.inputId ?? entry.subject ?? ""}`)).toEqual([
      "BLOCKING:DATASET_NOT_AVAILABLE:poi:school", "BLOCKING:NO_COVERAGE:z", "WARNING:DATA_STALE:a", "WARNING:DATA_STALE:b", "INFO:ATTRIBUTION_REQUIRED:b",
    ]);
  });

  it("removes exact duplicates but keeps gaps that differ by input, subject or text", () => {
    expect(normalizeGaps([gap("DATA_STALE", { inputId: "a" }), gap("DATA_STALE", { inputId: "a" })])).toHaveLength(1);
    expect(normalizeGaps([gap("DATA_STALE", { inputId: "a" }), gap("DATA_STALE", { inputId: "b" })])).toHaveLength(2);
    const first = createGap(sharedGapCatalog, "RESULT_TRUNCATED", { limit: 5 }, { subject: "s" });
    const second = createGap(sharedGapCatalog, "RESULT_TRUNCATED", { limit: 9 }, { subject: "s" });
    expect(normalizeGaps([second, first]).map((entry) => entry.message.en)).toEqual([first.message.en, second.message.en]);
  });

  it("is independent of input order and idempotent", () => {
    const gaps = [gap("DATA_STALE", { inputId: "a" }), gap("NO_COVERAGE", { inputId: "b" }), gap("ATTRIBUTION_REQUIRED", { inputId: "a" })];
    expect(normalizeGaps([...gaps].reverse())).toEqual(normalizeGaps(gaps));
    expect(normalizeGaps(normalizeGaps(gaps))).toEqual(normalizeGaps(gaps));
    expect(isNormalizedGapList(normalizeGaps(gaps))).toBe(true);
    expect(isNormalizedGapList([...normalizeGaps(gaps)].reverse())).toBe(false);
    expect(isNormalizedGapList([gap("DATA_STALE"), gap("DATA_STALE")])).toBe(false);
  });

  it("summarizes by severity and finds a gap by code and input", () => {
    const gaps = normalizeGaps([gap("NO_COVERAGE", { inputId: "a" }), gap("DATA_STALE", { inputId: "a" }), gap("DATA_STALE", { inputId: "b" }), gap("ATTRIBUTION_REQUIRED", { inputId: "a" })]);
    expect(summarizeGaps(gaps)).toEqual({ BLOCKING: 1, WARNING: 2, INFO: 1 });
    expect(hasGap(gaps, "DATA_STALE", "b")).toBe(true);
    expect(hasGap(gaps, "DATA_STALE", "c")).toBe(false);
    expect(hasGap(gaps, "DATA_STALE")).toBe(true);
  });
});

describe("catalog helpers", () => {
  it("extracts sorted unique placeholders", () => {
    expect(placeholdersOf("{b} and {a} and {b}")).toEqual(["a", "b"]);
    expect(placeholdersOf("none")).toEqual([]);
  });

  it("combines catalogs and refuses a code defined twice", () => {
    const own = { OWN_GAP: { severity: "INFO", message: { ar: "نص {x}", en: "text {x}" }, remedy: { ar: "إجراء", en: "action" } } } as const satisfies GapCatalog;
    const combined = combineGapCatalogs(sharedGapCatalog, own);
    expect(Object.keys(combined)).toContain("OWN_GAP");
    expect(Object.keys(combined)).toContain("NO_COVERAGE");
    expect(Object.isFrozen(combined)).toBe(true);
    expect(() => combineGapCatalogs(sharedGapCatalog, { NO_COVERAGE: own.OWN_GAP })).toThrow(/defined twice/);
  });

  it("reports catalog defects", () => {
    const broken = {
      bad_code: { severity: "INFO", message: { ar: "ن", en: "t" }, remedy: { ar: "إ", en: "a" } },
      MISMATCH: { severity: "INFO", message: { ar: "نص {x}", en: "text {y}" }, remedy: { ar: "إ", en: "a" } },
      NO_TEXT: { severity: "INFO", message: { ar: "", en: "t" }, remedy: { ar: "إ", en: "a" } },
    } as unknown as GapCatalog;
    const problems = catalogProblems(broken);
    expect(problems).toContain("bad_code: invalid code");
    expect(problems).toContain("MISMATCH: message placeholders differ between ar and en");
    expect(problems).toContain("NO_TEXT: message must have ar and en text");
  });
});

describe("deriveInputGaps", () => {
  const codes = (gaps: Gap[]) => gaps.map((gap) => gap.code);

  it("reports only the attribution obligation for a clean, declared, fresh, measured inventory", () => {
    expect(codes(deriveInputGaps(makeInput()))).toEqual(["ATTRIBUTION_REQUIRED"]);
  });

  it("reports every limitation of an unregistered sample layer and fails closed on rights", () => {
    expect(codes(deriveInputGaps(makeUnregisteredSampleInput())).sort()).toEqual([
      "ATTRIBUTION_REQUIRED", "COMPLETENESS_SAMPLE", "COVERAGE_UNDECLARED", "EXPORT_NOT_PERMITTED", "FRESHNESS_UNKNOWN", "LICENSE_CLASS_UNDECLARED", "MAP_LAYER_UNREGISTERED", "QUALITY_UNAVAILABLE",
    ]);
  });

  it("separates expired, stale and unknown freshness", () => {
    const fresh = { sourcePublishedAt: "2026-09-01T00:00:00.000Z", freshnessDays: 90, expiresAt: null };
    expect(codes(deriveInputGaps(makeInput({ freshness: { status: "EXPIRED", ...fresh } })))).toContain("DATA_EXPIRED");
    expect(codes(deriveInputGaps(makeInput({ freshness: { status: "STALE", ...fresh } })))).toContain("DATA_STALE");
    expect(codes(deriveInputGaps(makeInput({ freshness: { status: "UNKNOWN", sourcePublishedAt: null, freshnessDays: null, expiresAt: null } })))).toContain("FRESHNESS_UNKNOWN");
    expect(codes(deriveInputGaps(makeInput({ freshness: { status: "EXPIRED", ...fresh } })))).not.toContain("DATA_STALE");
  });

  it("reports unknown completeness and insufficient quality distinctly", () => {
    expect(codes(deriveInputGaps(makeInput({ completeness: "UNKNOWN", quality: { status: "INSUFFICIENT_DATA", method: "m", methodVersion: "1", measuredAt: "2026-10-01T00:00:00.000Z", explanation: "e" } }))))
      .toEqual(expect.arrayContaining(["COMPLETENESS_UNKNOWN", "QUALITY_INSUFFICIENT_DATA"]));
  });

  it("reports a restricted license once and does not add a second export gap", () => {
    const restricted = codes(deriveInputGaps(makeInput({ licenseClass: "RESTRICTED", allowExport: false })));
    expect(restricted).toContain("LICENSE_CLASS_RESTRICTED");
    expect(restricted).not.toContain("EXPORT_NOT_PERMITTED");
  });

  it("does not ask an engine output for a license class or a coverage", () => {
    expect(codes(deriveInputGaps(makeEngineRunInput()))).toEqual([]);
  });

  it("carries the dataset label and the input id on every gap", () => {
    for (const gap of deriveInputGaps(makeUnregisteredSampleInput())) {
      expect(gap.inputId).toBe("map:sample:pois");
      expect(gap.message.en).not.toMatch(/\{[a-z]+\}/i);
    }
  });
});
