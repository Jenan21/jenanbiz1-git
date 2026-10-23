import { z } from "zod";
import { failureCodeSchema, hashSchema, instantSchema, opaqueIdSchema, scopeSchema } from "./contracts";
import { parsePrivacy } from "./policy";

export const auditEventSchema = z.object({
  contract: z.literal("jenan.privacy-gateway.audit/v1"), id: opaqueIdSchema, scope: scopeSchema, actorId: opaqueIdSchema,
  operation: z.enum(["INTAKE", "PROCESS", "VERIFY", "RELEASE", "DESTROY", "KEY_ACCESS", "AUDIT_READ", "RECONCILE"]),
  at: instantSchema, revision: z.number().int().nonnegative(), policyHash: hashSchema,
  outcome: z.enum(["ALLOWED", "DENIED", "FAILED", "REVIEW_REQUIRED", "PENDING"]),
  reason: failureCodeSchema.nullable(), artifactId: opaqueIdSchema.nullable(), receiptId: opaqueIdSchema.nullable(),
  previousEventHash: hashSchema.nullable(),
}).strict();
export function parsePrivacyAuditEvent(raw: unknown) { return parsePrivacy(auditEventSchema, raw); }
