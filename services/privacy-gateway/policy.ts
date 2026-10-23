import { z } from "zod";
import { canonicalHash } from "../analysis-engines/shared/canonical";
import {
  PrivacyError, actorSchema, grantSchema, instantSchema, policySchema, type PrivacyActor,
  type PrivacyGrant, type PrivacyRole, type PrivacyScope, type SanitizationPolicy,
} from "./contracts";

export const initialPrivacyLimits = Object.freeze({
  packageBytes: 100 * 1024 * 1024, expandedBytes: 500 * 1024 * 1024,
  entries: 1000, depth: 3, expansionRatio: 100, rawTtlMs: 86_400_000, cleanupTargetMs: 900_000,
});
export const protectedAnalyticalFields = [
  "AMOUNT", "DATE", "REVENUE", "EXPENSE", "SALARY", "RENT", "TAX", "CASH_FLOW",
  "LIABILITY", "ACCOUNTING_CATEGORY", "QUANTITY", "PRICE", "UNIT", "CURRENCY",
] as const;
export function samePrivacyValue(left: unknown, right: unknown) {
  return privacyHash(left) === privacyHash(right);
}
export function privacyHash(value: unknown): string {
  let nodes = 0; let stringBytes = 0; const active = new Set<object>();
  function check(entry: unknown, depth: number): void {
    if (++nodes > 20_000 || depth > 32) throw new PrivacyError("MALFORMED_INPUT");
    if (typeof entry === "string") {
      stringBytes += Buffer.byteLength(entry, "utf8");
      if (stringBytes > 256 * 1024) throw new PrivacyError("MALFORMED_INPUT");
      return;
    }
    if (entry === null || typeof entry === "boolean") return;
    if (typeof entry === "number" && Number.isFinite(entry)) return;
    if (typeof entry !== "object" || active.has(entry)) throw new PrivacyError("MALFORMED_INPUT");
    const prototype = Object.getPrototypeOf(entry);
    if (!Array.isArray(entry) && prototype !== Object.prototype && prototype !== null) throw new PrivacyError("MALFORMED_INPUT");
    active.add(entry);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(entry))) {
      if (descriptor.get || descriptor.set || !descriptor.enumerable && !(Array.isArray(entry) && key === "length")) throw new PrivacyError("MALFORMED_INPUT");
      stringBytes += Buffer.byteLength(key, "utf8");
      if (stringBytes > 256 * 1024) throw new PrivacyError("MALFORMED_INPUT");
    }
    if (Object.getOwnPropertySymbols(entry).length || Array.isArray(entry) &&
      Object.keys(entry).length !== entry.length) throw new PrivacyError("MALFORMED_INPUT");
    for (const child of Object.values(entry)) check(child, depth + 1);
    active.delete(entry);
  }
  check(value, 0);
  // Shared canonical hashing is reused read-only; no Shared contract or engine runtime is changed.
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 256 * 1024) throw new PrivacyError("MALFORMED_INPUT");
  return canonicalHash(value);
}
export function parsePrivacy<T>(schema: z.ZodType<T>, raw: unknown): T {
  privacyHash(raw);
  const result = schema.safeParse(raw);
  if (!result.success) throw new PrivacyError("MALFORMED_INPUT");
  return result.data;
}
export function validatePolicy(raw: unknown): SanitizationPolicy {
  const policy = parsePrivacy(policySchema, raw);
  if (!protectedAnalyticalFields.every((field) => policy.analyticalFields.includes(field)) ||
    policy.pins.sanitization.hash !== privacyPolicyContentHash(policy)) throw new PrivacyError("POLICY_MISMATCH");
  return policy;
}
export function privacyPolicyContentHash(policy: SanitizationPolicy) {
  const reference = { component: policy.pins.sanitization.component, version: policy.pins.sanitization.version };
  return privacyHash({ ...policy, pins: { ...policy.pins, sanitization: reference } });
}
export function assertPrivacyRole(rawActor: PrivacyActor, rawGrants: PrivacyGrant[], role: PrivacyRole, scope: PrivacyScope, now: string) {
  const actor = parsePrivacy(actorSchema, rawActor);
  const grants = parsePrivacy(z.array(grantSchema).max(100), rawGrants);
  parsePrivacy(instantSchema, now);
  const current = grants.filter((grant) => grant.actorId === actor.id && grant.active &&
    grant.authorizationRevision === actor.authorizationRevision && samePrivacyValue(grant.scope, scope) &&
    grant.validFrom <= now && grant.expiresAt > now);
  const held = new Set(current.map((grant) => grant.role));
  if (!actor.active || !held.has(role) ||
    held.has("SANITIZER") && (held.has("VERIFIER") || held.has("PUBLISHER")) ||
    held.has("VERIFIER") && held.has("PUBLISHER") ||
    held.has("PUBLISHER") && (held.has("INTAKE") || held.has("KEY_ACCESS"))) throw new PrivacyError("AUTHORIZATION_DENIED");
}
export function assertRawAccess(actor: PrivacyActor, grants: PrivacyGrant[], scope: PrivacyScope, now: string) {
  assertPrivacyRole(actor, grants, "KEY_ACCESS", scope, now);
  if (!grants.some((grant) => ["SANITIZER", "VERIFIER", "INTAKE"].includes(grant.role) &&
    grant.actorId === actor.id && grant.active && grant.authorizationRevision === actor.authorizationRevision &&
    samePrivacyValue(grant.scope, scope) && grant.validFrom <= now && grant.expiresAt > now)) throw new PrivacyError("AUTHORIZATION_DENIED");
}
