import { z } from "zod";
import { canonicalHash, canonicalize, omitKeys } from "../shared/canonical";
import { computeInputsHash, computeOutputHash, computeRequestHash, engineInputSchema } from "../shared/contracts";
import { identifierSchema, sha256Schema, timestampSchema } from "../shared/primitives";
import { MAX_RUN_JSON_BYTES, runRecordSchema } from "../shared/run-record";
import { riskEngineKeys, riskTimestampSchema } from "./semantics";

export const riskNativeManifest = {
  spatial: { version: "1.0.0-m6", request: "jenan.spatial-analysis.request/v1", result: "jenan.spatial-analysis.result/v1", recipe: "SHARED_V1" },
  "market-demand": { version: "1.0.0-m3", request: "jenan.market-demand.request/v1", result: "jenan.market-demand.result/v1", recipe: "SHARED_V1" },
  "competitor-analysis": { version: "1.0.0-m3", request: "jenan.competitor-analysis.request/v1", result: "jenan.competitor-analysis.result/v1", recipe: "SHARED_V1" },
  "opportunity-gap": { version: "1.0.0-m3", request: "jenan.opportunity-gap.request/v1", result: "jenan.opportunity-gap.result/v1", recipe: "SHARED_V1" },
  "financial-feasibility": { version: "1.0.0-m3", request: "jenan.financial-feasibility.request/v1", result: "jenan.financial-feasibility.result/v1", recipe: "LOCAL_DECIMAL_V1" },
  "operational-feasibility": { version: "1.0.0-m3", request: "jenan.operational-feasibility.request/v1", result: "jenan.operational-feasibility.calculation-result/v1", recipe: "LOCAL_DECIMAL_V1" },
} as const;
export const riskRunPinSchema = z.object({
  engineKey: z.enum(riskEngineKeys), runId: identifierSchema, engineVersion: identifierSchema,
  requestContract: z.string().min(1).max(120), resultContract: z.string().min(1).max(120),
  requestHash: sha256Schema, inputsHash: sha256Schema, outputHash: sha256Schema, contentHash: sha256Schema,
  evaluatedAt: riskTimestampSchema,
}).strict().superRefine((v, ctx) => {
  const expected = riskNativeManifest[v.engineKey];
  if (v.engineVersion !== expected.version || v.requestContract !== expected.request || v.resultContract !== expected.result) {
    ctx.addIssue({ code: "custom", message: "Unsupported native engine version/request/result contract" });
  }
});
export type RiskRunPin = z.infer<typeof riskRunPinSchema>;
export const riskJsonBounds = { depth: 64, nodes: 200_000 } as const;
export function ensureRiskJsonSize(value: unknown, maxBytes = MAX_RUN_JSON_BYTES): void {
  let nodes = 0; let stringBytes = 0; const active = new Set<object>();
  const inspect = (entry: unknown, depth: number): void => {
    if (++nodes > riskJsonBounds.nodes || depth > riskJsonBounds.depth) throw new RangeError("Risk JSON structural depth/node bound exceeded");
    if (typeof entry === "string") {
      stringBytes += Buffer.byteLength(entry, "utf8");
      if (stringBytes > maxBytes) throw new RangeError("Risk JSON exceeds its byte limit (2 MiB storage envelope)");
    }
    if (entry !== null && typeof entry === "object") {
      if (active.has(entry)) throw new RangeError("Cyclic Risk JSON is not supported");
      active.add(entry);
      if (!Array.isArray(entry)) {
        for (const key of Object.keys(entry)) stringBytes += Buffer.byteLength(key, "utf8");
        if (stringBytes > maxBytes) throw new RangeError("Risk JSON exceeds its byte limit (2 MiB storage envelope)");
      }
      for (const child of Object.values(entry)) inspect(child, depth + 1);
      active.delete(entry);
    }
  };
  inspect(value, 0);
  if (Buffer.byteLength(canonicalize(value), "utf8") > maxBytes) throw new RangeError("Risk JSON exceeds its byte limit (2 MiB storage envelope)");
}
const nativeShellSchema = z.looseObject({
  contract: z.string(), runId: identifierSchema, evaluatedAt: timestampSchema,
  engine: z.looseObject({ key: z.enum(riskEngineKeys), version: identifierSchema }),
  request: z.record(z.string(), z.unknown()), inputs: z.array(engineInputSchema).max(200),
  status: z.enum(["COMPLETED", "COMPLETED_WITH_GAPS"]),
  determinism: z.object({ requestHash: sha256Schema, inputsHash: sha256Schema, outputHash: sha256Schema }).strict(),
});

/** Envelope integrity only, not authorization or proof of native business semantics. Never recalculates a previous engine. */
export function inspectRetainedRiskEnvelope(rawRecord: unknown, rawPin: unknown) {
  ensureRiskJsonSize(rawRecord);
  const record = runRecordSchema.parse(rawRecord); const pin = riskRunPinSchema.parse(rawPin);
  const native = nativeShellSchema.parse(record.result);
  const recipe = riskNativeManifest[pin.engineKey].recipe;
  const matches = record.runId === pin.runId && record.engineKey === pin.engineKey && record.engineVersion === pin.engineVersion &&
    record.requestContract === pin.requestContract && record.resultContract === pin.resultContract &&
    native.runId === pin.runId && native.engine.key === pin.engineKey && native.engine.version === pin.engineVersion &&
    native.contract === pin.resultContract && native.evaluatedAt === pin.evaluatedAt && native.status === record.status &&
    native.engine.environment === record.environment &&
    (pin.engineKey === "spatial" || native.request.evaluatedAt === native.evaluatedAt) &&
    canonicalize(native.timing) === canonicalize(record.timing);
  if (!matches || canonicalize(native.request) !== canonicalize(record.request) ||
    canonicalize(native.inputs) !== canonicalize(record.inputs.map((i) => i.snapshot))) throw new RangeError("Retained native envelope identity/input mismatch");
  if (canonicalHash(record.result) !== pin.contentHash) throw new RangeError("Retained native content hash mismatch");
  if (recipe === "LOCAL_DECIMAL_V1" && native.phase !== "M3_CALCULATIONS") throw new RangeError("Foundation output is not native calculation evidence");
  const expected = {
    requestHash: recipe === "SHARED_V1" ? computeRequestHash(native.request) : canonicalHash(native.request),
    inputsHash: recipe === "SHARED_V1" ? computeInputsHash(native.inputs) : canonicalHash(native.inputs),
    outputHash: recipe === "SHARED_V1" ? computeOutputHash(native) : canonicalHash(omitKeys(native, ["determinism", "runId", "timing"])),
  };
  if (canonicalize(native.determinism) !== canonicalize(expected) ||
    Object.entries(expected).some(([key, value]) => record[key as keyof typeof expected] !== value || pin[key as keyof typeof expected] !== value)) throw new RangeError("Retained native deterministic hash mismatch");
  return { pin, recipe, integrity: "ENVELOPE_HASHES_ONLY" as const, currentAuthorization: "NOT_CHECKED" as const };
}
