import { z } from "zod";
import { identifierSchema, shortTextSchema } from "../shared/primitives";
import { financialTimestamp, financialAssumptionSchema, financialScheduleSchema } from "./model";
import { financialRequestSchema, normalizeFinancialRequest } from "./request";
import type { FinancialSourceReference } from "./data-port";

export const FINANCIAL_MODEL_TYPE_KEY = "financial-feasibility-model";
const localEvidence = z.array(identifierSchema).min(1).max(32);
const { contract: requestContract, data: requestData, ...modelShape } = financialRequestSchema.shape;
void requestContract; void requestData;
export const financialDatasetSchema = z.object({
  contract: z.literal("jenan.financial-feasibility.dataset/v1"), sourceId: identifierSchema,
  role: z.literal("financial.model-assumptions"),
  approval: z.object({
    status: z.enum(["OWNER_APPROVED", "UNREVIEWED"]), approvedBy: shortTextSchema,
    approvedAt: financialTimestamp, rationale: shortTextSchema, evidence: localEvidence,
  }).strict(),
  coverage: z.object({
    status: z.enum(["COMPLETE", "PARTIAL", "NONE", "UNKNOWN"]),
    completeness: z.enum(["INVENTORY", "SAMPLE", "UNKNOWN"]), evidence: localEvidence,
  }).strict(),
  sourceRecords: z.array(z.object({
    id: identifierSchema, reference: shortTextSchema, description: shortTextSchema, recordedAt: financialTimestamp,
  }).strict()).min(1).max(10_000),
  model: z.object({
    ...modelShape,
    assumptions: z.array(z.object({ ...financialAssumptionSchema.shape, evidence: localEvidence }).strict()).max(1000),
    schedules: z.array(z.object({ ...financialScheduleSchema.shape, evidence: localEvidence }).strict()).max(17),
    scenarios: z.array(z.object({ ...financialRequestSchema.shape.scenarios.element.shape, evidence: localEvidence }).strict()).max(9),
    sensitivity: z.array(z.object({ ...financialRequestSchema.shape.sensitivity.element.shape, evidence: localEvidence }).strict()).max(20),
  }).strict(),
  limitations: z.array(shortTextSchema).min(1).max(10),
}).strict().superRefine((dataset, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const records = new Set(dataset.sourceRecords.map((record) => record.id));
  if (records.size !== dataset.sourceRecords.length) fail("Financial source record IDs must be unique");
  const refs = [...dataset.approval.evidence, ...dataset.coverage.evidence,
    ...dataset.model.assumptions.flatMap((entry) => entry.evidence), ...dataset.model.schedules.flatMap((entry) => entry.evidence),
    ...dataset.model.scenarios.flatMap((entry) => entry.evidence), ...dataset.model.sensitivity.flatMap((entry) => entry.evidence)];
  if (refs.some((id) => !records.has(id))) fail("All financial evidence must resolve to a documented local source record");
  if (dataset.coverage.status === "COMPLETE" && dataset.coverage.completeness !== "INVENTORY") fail("Complete model coverage requires an inventory");
});
export type FinancialDataset = z.infer<typeof financialDatasetSchema>;

/** Local record IDs avoid a circular checksum embedded in the exact bytes being hashed. */
export function bindFinancialDataset(dataset: FinancialDataset, reference: FinancialSourceReference, evaluatedAt: string) {
  const evidence = (ids: string[]) => ids.map((sourceRecordId) => ({
    inputId: `dc:${reference.version.versionId}`, versionId: reference.version.versionId,
    checksum: reference.version.checksum.value, sourceRecordId,
  }));
  return normalizeFinancialRequest({
    ...dataset.model, contract: "jenan.financial-feasibility.request/v1",
    data: { versions: [{ versionId: reference.version.versionId, checksum: reference.version.checksum.value }] },
    assumptions: dataset.model.assumptions.map((entry) => ({ ...entry, evidence: evidence(entry.evidence) })),
    schedules: dataset.model.schedules.map((entry) => ({ ...entry, evidence: evidence(entry.evidence) })),
    scenarios: dataset.model.scenarios.map((entry) => ({ ...entry, evidence: evidence(entry.evidence) })),
    sensitivity: dataset.model.sensitivity.map((entry) => ({ ...entry, evidence: evidence(entry.evidence) })),
  }, evaluatedAt).normalized;
}
