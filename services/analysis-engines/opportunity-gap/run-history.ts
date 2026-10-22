import { z } from "zod";
import { canonicalize, sha256Hex } from "../shared/canonical";
import { buildRunRecord, runRecordSchema, type RunRecord } from "../shared/run-record";
import { identifierSchema } from "../shared/primitives";
import { analyzeOpportunityData, findOpportunityCalculationProblems, OPPORTUNITY_CALCULATION_VERSION, opportunityCalculationResultSchema, type OpportunityCalculationResult } from "./calculations";
import { opportunityDiscoverySchema, opportunityReadSchema, type OpportunityDataPort } from "./data-port";
import { ensureOpportunitySize } from "./request";
import { timestamp } from "./model";

export const opportunityHistoryAccessSchema = z.object({
  specialty: z.string().trim().min(1).max(80).optional(),
  missionContext: z.string().trim().min(1).max(80).optional(),
  organizationId: identifierSchema.optional(),
}).strict();
export type OpportunityHistoryAccess = z.infer<typeof opportunityHistoryAccessSchema>;
export const opportunityRecordContextSchema = z.object({
  actor: z.object({ kind: z.enum(["USER", "ROBOT"]), id: identifierSchema }).strict(),
  createdAt: timestamp, subject: z.string().min(1).max(128).optional(),
  access: opportunityHistoryAccessSchema,
}).strict();
export type OpportunityRecordContext = z.infer<typeof opportunityRecordContextSchema>;
const entrySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("DISCOVER"), query: z.object({ versionIds: z.array(identifierSchema).length(1) }).strict(), response: opportunityDiscoverySchema }).strict(),
  z.object({ operation: z.literal("READ"), query: z.object({ versionId: identifierSchema, expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), response: opportunityReadSchema }).strict(),
]);
export const opportunityHistoryRuntimeSchema = z.object({
  contract: z.literal("jenan.opportunity-gap.run-history/v1"),
  replayAuthorizationContext: opportunityHistoryAccessSchema,
  transcript: z.array(entrySchema).max(64),
}).strict();
export type OpportunityReadTranscript = z.infer<typeof opportunityHistoryRuntimeSchema>["transcript"];

export class OpportunityHistoryUnavailable extends Error {
  constructor() { super("This Opportunity run or its historical inputs are unavailable"); this.name = "OpportunityHistoryUnavailable"; }
}
export class OpportunityHistoryMismatch extends Error {
  constructor(readonly reason: "ENGINE_VERSION" | "STORED_EVIDENCE" | "VERSION_CHECKSUM" | "REQUEST_HASH" | "INPUT_HASH" | "OUTPUT_HASH") {
    super(`Opportunity historical integrity mismatch: ${reason}`); this.name = "OpportunityHistoryMismatch";
  }
}
export function captureOpportunityReads(port: OpportunityDataPort) {
  const transcript: OpportunityReadTranscript = [];
  const capture = (entry: OpportunityReadTranscript[number]) => {
    transcript.push(structuredClone(entry));
    if (transcript.length > 64) throw new RangeError("Opportunity historical transcript exceeds 64 operations");
    ensureOpportunitySize(transcript);
  };
  return {
    transcript,
    port: {
      async discover(query) {
        const response = opportunityDiscoverySchema.parse(await port.discover(query));
        capture({ operation: "DISCOVER", query, response }); return response;
      },
      async read(query) {
        const response = opportunityReadSchema.parse(await port.read(query));
        capture({ operation: "READ", query, response }); return response;
      },
    } satisfies OpportunityDataPort,
  };
}
export async function reproduceOpportunityTranscript(result: OpportunityCalculationResult, transcript: OpportunityReadTranscript) {
  let index = 0;
  const take = (operation: "READ" | "DISCOVER", query: unknown) => {
    const entry = transcript[index++];
    if (!entry || entry.operation !== operation || canonicalize(entry.query) !== canonicalize(query)) throw new OpportunityHistoryMismatch("STORED_EVIDENCE");
    return entry;
  };
  const port: OpportunityDataPort = {
    async discover(query) {
      const entry = take("DISCOVER", query);
      if (entry.operation !== "DISCOVER") throw new OpportunityHistoryMismatch("STORED_EVIDENCE");
      return structuredClone(entry.response);
    },
    async read(query) {
      const entry = take("READ", query);
      if (entry.operation !== "READ") throw new OpportunityHistoryMismatch("STORED_EVIDENCE");
      return structuredClone(entry.response);
    },
  };
  const replayed = await analyzeOpportunityData(port, result.request.normalized, {
    runId: result.runId, evaluatedAt: result.evaluatedAt, environment: result.engine.environment, timing: result.timing,
  });
  if (index !== transcript.length) throw new OpportunityHistoryMismatch("STORED_EVIDENCE");
  if (replayed.determinism.requestHash !== result.determinism.requestHash) throw new OpportunityHistoryMismatch("REQUEST_HASH");
  if (replayed.determinism.inputsHash !== result.determinism.inputsHash) throw new OpportunityHistoryMismatch("INPUT_HASH");
  if (canonicalize(replayed) !== canonicalize(result)) throw new OpportunityHistoryMismatch("OUTPUT_HASH");
  return replayed;
}
export function buildOpportunityRunRecord(result: OpportunityCalculationResult, rawContext: OpportunityRecordContext, transcript: OpportunityReadTranscript): RunRecord {
  const context = opportunityRecordContextSchema.parse(rawContext);
  if (findOpportunityCalculationProblems(result).length) throw new OpportunityHistoryMismatch("OUTPUT_HASH");
  const runtime = opportunityHistoryRuntimeSchema.parse({
    contract: "jenan.opportunity-gap.run-history/v1", replayAuthorizationContext: context.access, transcript,
  });
  ensureOpportunitySize(runtime);
  return runRecordSchema.parse(buildRunRecord(result, { actor: context.actor, createdAt: context.createdAt, subject: context.subject, runtime }));
}
export function validateOpportunityRunRecord(raw: unknown) {
  const record = runRecordSchema.parse(raw);
  if (record.engineKey !== "opportunity-gap" || record.engineVersion !== OPPORTUNITY_CALCULATION_VERSION
    || record.requestContract !== "jenan.opportunity-gap.request/v1" || record.resultContract !== "jenan.opportunity-gap.result/v1") throw new OpportunityHistoryMismatch("ENGINE_VERSION");
  const runtime = opportunityHistoryRuntimeSchema.parse(record.runtime);
  const result = opportunityCalculationResultSchema.parse(record.result);
  const actor = opportunityRecordContextSchema.shape.actor.parse(record.actor);
  const expected = buildOpportunityRunRecord(result, {
    actor, createdAt: record.createdAt, access: runtime.replayAuthorizationContext, ...(record.subject === null ? {} : { subject: record.subject }),
  }, runtime.transcript);
  if (canonicalize(expected) !== canonicalize(record)) throw new OpportunityHistoryMismatch("STORED_EVIDENCE");
  return { record, result, runtime };
}
export function opportunityInputHistory(result: OpportunityCalculationResult, transcript: OpportunityReadTranscript, inputId: string) {
  const input = result.inputs.find((entry) => entry.id === inputId);
  const reads = transcript.filter((entry) => entry.operation === "READ" && entry.response.status === "AVAILABLE" && entry.response.reference.version.versionId === input?.ref.id);
  const first = reads[0];
  if (!input || first?.operation !== "READ" || first.response.status !== "AVAILABLE") throw new OpportunityHistoryMismatch("STORED_EVIDENCE");
  return {
    reference: first.response.reference, contentHash: sha256Hex(first.response.content),
    provenance: { contract: "jenan.opportunity-gap.input-provenance/v1", reference: first.response.reference,
      records: result.evidence.facts.flatMap((fact) => fact.evidence).filter((ref) => ref.inputId === inputId) },
    usageIntent: { contract: "jenan.opportunity-gap.input-usage/v1", consumer: "opportunity-gap", runId: result.runId,
      versionId: input.ref.id, checksum: input.checksum?.value, roles: input.roles, analyses: result.request.normalized.analyses },
  };
}
