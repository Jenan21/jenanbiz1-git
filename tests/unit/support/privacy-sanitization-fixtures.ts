import { generateKeyPairSync, sign, verify } from "node:crypto";
import { EphemeralIntake } from "@/services/privacy-gateway/intake/staging";
import { privacyPolicyContentHash } from "@/services/privacy-gateway/policy";
import { PrivacySanitization, m3References } from "@/services/privacy-gateway/sanitization/service";
import type { M3Runtime, ReceiptSigner } from "@/services/privacy-gateway/sanitization/contracts";
import { csv, intakeFixture } from "./privacy-intake-fixtures";
import { privacyId } from "./privacy-gateway-fixtures";

export const safeCsv = () => csv("person_name,email,amount,date,currency,unit,period,category\nSynthetic Person A,synth@example.test,-100.2300,2026-10-01,SAR,MONTH,2026-10,RENT\nSynthetic Person A,synth@example.test,-100.2300,2026-10-01,SAR,MONTH,2026-10,RENT\nSynthetic Person A,synth@example.test,-100.2300,2026-10-01,SAR,MONTH,2026-10,RENT");
export function sanitizationFixture() {
  const f = intakeFixture(); Object.assign(f.policy.pins, m3References());
  f.policy.pins.sanitization.hash = privacyPolicyContentHash(f.policy); f.job.pins = structuredClone(f.policy.pins);
  const sanitizer = f.actor.id === privacyId(11) ? f.actor : { ...f.actor, id: privacyId(11) };
  const verifier = { ...f.actor, id: privacyId(12) };
  const roles = new Map([
    [f.actor.id, f.grants],
    [sanitizer.id, f.grants.map((grant) => ({ ...grant, actorId: sanitizer.id, role: grant.role === "INTAKE" ? "SANITIZER" as const : grant.role }))],
    [verifier.id, f.grants.map((grant) => ({ ...grant, actorId: verifier.id, role: grant.role === "INTAKE" ? "VERIFIER" as const : grant.role }))],
  ]);
  let allowed = true; let serial = 9000;
  const auth: M3Runtime["currentAuthorization"] = async (_job, actorId) => ({
    actor: { ...f.actor, id: actorId, active: allowed }, grants: roles.get(actorId) ?? [],
  });
  f.runtime.currentAuthorization = auth;
  const audits: Parameters<M3Runtime["audit"]>[0][] = [];
  const expiry: Parameters<M3Runtime["scheduleMappingCleanup"]>[0][] = [];
  const runtime: M3Runtime = {
    now: f.runtime.now, id: () => privacyId(serial++), currentAuthorization: auth,
    async audit(event) { audits.push(event); },
    async scheduleMappingCleanup(event) { expiry.push(event); },
  };
  const key = generateKeyPairSync("ed25519"); const keyId = privacyId(8000);
  const signer: ReceiptSigner = {
    qualification: "TEST_ONLY",
    async sign(payload) { return { algorithm: "Ed25519", keyId, keyVersion: 1, value: sign(null, payload, key.privateKey).toString("base64") }; },
    async verify(payload, signature) {
      return signature.keyId === keyId && verify(null, payload, key.publicKey, Buffer.from(signature.value, "base64"));
    },
  };
  const intake = new EphemeralIntake(f.runtime, f.storage, f.keys, f.scanner, f.policy);
  const service = new PrivacySanitization(intake, runtime, signer, f.policy);
  const receive = (bytes: Uint8Array = safeCsv()) => intake.receive(f.job, f.actor.id, bytes, { extension: "csv", mime: "text/csv" });
  return { ...f, sanitizer, verifier, roles, audits, expiry, runtime, signer, intake, service, receive,
    revokeM3: () => { allowed = false; },
  };
}
