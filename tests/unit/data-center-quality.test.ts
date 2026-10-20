import { describe, expect, it } from "vitest";
import { commandSchema, qualityAssessmentSchema } from "@/services/data-center/contracts";
import { recordDataCenterQualityAssessment } from "@/services/data-center/quality";

const base = { versionId: "v1", status: "MEASURED", score: 0.82, method: "manual-completeness-review", methodVersion: "2026.10", measuredAt: "2026-10-01T09:00:00.000Z", explanation: "Checked 200 sampled rows against the source." } as const;

describe("Data Center quality assessment contract", () => {
  it("requires a score exactly when the assessment is MEASURED", () => {
    expect(qualityAssessmentSchema.parse(base)).toMatchObject({ status: "MEASURED", score: 0.82, metrics: {} });
    expect(() => qualityAssessmentSchema.parse({ ...base, score: undefined })).toThrow();
    expect(qualityAssessmentSchema.parse({ ...base, status: "INSUFFICIENT_DATA", score: undefined, explanation: "No sample could be matched to the source." }).score).toBeUndefined();
    expect(() => qualityAssessmentSchema.parse({ ...base, status: "INSUFFICIENT_DATA" })).toThrow();
  });
  it("keeps scores within 0 to 1 and finite", () => {
    for (const score of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, 82]) expect(() => qualityAssessmentSchema.parse({ ...base, score })).toThrow();
    for (const score of [0, 1, 0.5]) expect(qualityAssessmentSchema.parse({ ...base, score }).score).toBe(score);
  });
  it("never accepts a score without its method, method version, date and explanation", () => {
    for (const missing of ["method", "methodVersion", "measuredAt", "explanation", "versionId"] as const) expect(() => qualityAssessmentSchema.parse({ ...base, [missing]: undefined }), missing).toThrow();
    for (const blank of ["method", "methodVersion", "explanation"] as const) expect(() => qualityAssessmentSchema.parse({ ...base, [blank]: "   " }), blank).toThrow();
    expect(() => qualityAssessmentSchema.parse({ ...base, measuredAt: "yesterday" })).toThrow();
  });
  it("bounds explanatory metrics to a small flat object of scalars", () => {
    expect(qualityAssessmentSchema.parse({ ...base, metrics: { completeness: 0.9, formatErrors: 3, note: "sampled", reviewed: true } }).metrics).toMatchObject({ completeness: 0.9 });
    expect(() => qualityAssessmentSchema.parse({ ...base, metrics: { nested: { a: 1 } } })).toThrow();
    expect(() => qualityAssessmentSchema.parse({ ...base, metrics: { list: [1] } })).toThrow();
    expect(() => qualityAssessmentSchema.parse({ ...base, metrics: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`m${i}`, i])) })).toThrow();
    expect(() => qualityAssessmentSchema.parse({ ...base, unexpected: true })).toThrow();
  });
  it("is available as a command and rejects invented fields", () => {
    expect(commandSchema.parse({ ...base, action: "record-quality-assessment" })).toMatchObject({ action: "record-quality-assessment", versionId: "v1" });
    expect(() => commandSchema.parse({ ...base, action: "record-quality-assessment", autoScore: true })).toThrow();
  });
  it("is restricted to administrators and rejects future measurement dates before touching the database", async () => {
    await expect(recordDataCenterQualityAssessment(base, { id: "u", systemRole: "USER", kind: "HUMAN" })).rejects.toMatchObject({ code: "ADMIN_REQUIRED", status: 403 });
    await expect(recordDataCenterQualityAssessment(base, { id: "robot", systemRole: "ADMIN", kind: "AI" })).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
    await expect(recordDataCenterQualityAssessment({ ...base, measuredAt: new Date(Date.now() + 86_400_000).toISOString() }, { id: "a", systemRole: "ADMIN", kind: "HUMAN" })).rejects.toMatchObject({ code: "FUTURE_MEASUREMENT_DATE" });
  });
});
