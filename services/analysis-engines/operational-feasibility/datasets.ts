import { z } from "zod";
import { identifierSchema, sha256Schema, shortTextSchema } from "../shared/primitives";
import { operationalRequestSchema, operationalTimestamp, operationalValueSchema, operationalScheduleSchema } from "./model";
import { normalizeOperationalRequest } from "./request";
import type { OperationalSourceReference } from "./data-port";

export const OPERATIONAL_MODEL_TYPE_KEY = "operational-feasibility-model";
const localEvidence = z.array(identifierSchema).min(1).max(32);
const { contract, ...modelShape } = operationalRequestSchema.shape;
void contract;
export const operationalSourceDatasetSchema = z.object({
  contract: z.literal("jenan.operational-feasibility.source-dataset/v1"), sourceId: identifierSchema,
  role: z.literal("operational.model"),
  approval: z.object({
    status: z.enum(["OWNER_APPROVED", "UNREVIEWED"]), approvedBy: shortTextSchema, approvedAt: operationalTimestamp,
    rationale: shortTextSchema, evidence: localEvidence,
  }).strict(),
  coverage: z.object({
    status: z.enum(["COMPLETE", "PARTIAL", "NONE", "UNKNOWN"]), completeness: z.enum(["INVENTORY", "SAMPLE", "UNKNOWN"]),
    siteIds: z.array(identifierSchema).min(1).max(200), periodIds: z.array(identifierSchema).min(1).max(120),
    evidence: localEvidence,
  }).strict(),
  sourceRecords: z.array(z.object({
    id: identifierSchema, reference: shortTextSchema, description: shortTextSchema, recordedAt: operationalTimestamp,
  }).strict()).min(1).max(10_000),
  model: z.object({
    ...modelShape,
    values: z.array(z.object({ ...operationalValueSchema.shape, evidence: localEvidence }).strict()).max(1000),
    schedules: z.array(z.object({ ...operationalScheduleSchema.shape, evidence: localEvidence }).strict()).max(200),
    requirements: z.object({
      applicabilityComplete: z.boolean(), evidence: localEvidence,
      entries: z.array(z.object({
        ...operationalRequestSchema.shape.requirements.shape.entries.element.shape,
        evidence: z.array(identifierSchema).max(32),
      }).strict()).max(1000),
    }).strict(),
    scenarios: z.array(z.object({ ...operationalRequestSchema.shape.scenarios.element.shape, evidence: localEvidence }).strict()).max(9),
    sensitivity: z.array(z.object({ ...operationalRequestSchema.shape.sensitivity.element.shape, evidence: localEvidence }).strict()).max(20),
  }).strict(),
  limitations: z.array(shortTextSchema).min(1).max(10),
}).strict().superRefine((dataset, context) => {
  const records = new Set(dataset.sourceRecords.map((r) => r.id));
  const refs = [...dataset.approval.evidence, ...dataset.coverage.evidence,
    ...dataset.model.values.flatMap((v) => v.evidence), ...dataset.model.schedules.flatMap((s) => s.evidence),
    ...dataset.model.requirements.evidence, ...dataset.model.requirements.entries.flatMap((e) => e.evidence),
    ...dataset.model.scenarios.flatMap((s) => s.evidence), ...dataset.model.sensitivity.flatMap((s) => s.evidence)];
  if (records.size !== dataset.sourceRecords.length || refs.some((id) => !records.has(id))) context.addIssue({ code: "custom", message: "Every local evidence reference needs one unique documented source record" });
  if (dataset.coverage.status === "COMPLETE" && dataset.coverage.completeness !== "INVENTORY") context.addIssue({ code: "custom", message: "Complete operational coverage needs inventory evidence" });
  for (const ids of [dataset.coverage.siteIds, dataset.coverage.periodIds]) if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Duplicate source coverage" });
});
export type OperationalSourceDataset = z.infer<typeof operationalSourceDatasetSchema>;
export const operationalPreparationRequestSchema = z.object({
  model: operationalRequestSchema,
  source: z.object({ sourceId: identifierSchema, versionId: identifierSchema, checksum: sha256Schema }).strict(),
}).strict();
export type OperationalPreparationRequest = z.infer<typeof operationalPreparationRequestSchema>;

/** Local evidence IDs avoid embedding a version checksum inside the bytes it hashes. */
export function bindOperationalDataset(dataset: OperationalSourceDataset, reference: OperationalSourceReference, evaluatedAt: string): OperationalPreparationRequest {
  const evidence = (ids: string[]) => ids.map((sourceRecordId) => ({
    inputId: `dc:${reference.version.versionId}`, versionId: reference.version.versionId,
    checksum: reference.version.checksum.value, sourceRecordId,
  }));
  const model = normalizeOperationalRequest({
    ...dataset.model, contract: "jenan.operational-feasibility.request/v1",
    values: dataset.model.values.map((v) => ({ ...v, evidence: evidence(v.evidence) })),
    schedules: dataset.model.schedules.map((s) => ({ ...s, evidence: evidence(s.evidence) })),
    requirements: { ...dataset.model.requirements, evidence: evidence(dataset.model.requirements.evidence),
      entries: dataset.model.requirements.entries.map((e) => ({ ...e, evidence: evidence(e.evidence) })) },
    scenarios: dataset.model.scenarios.map((s) => ({ ...s, evidence: evidence(s.evidence) })),
    sensitivity: dataset.model.sensitivity.map((s) => ({ ...s, evidence: evidence(s.evidence) })),
  }, evaluatedAt).normalized;
  return { model, source: { sourceId: reference.source.sourceId, versionId: reference.version.versionId, checksum: reference.version.checksum.value } };
}
