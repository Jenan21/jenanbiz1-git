import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { privacyFixture } from "./privacy-gateway-fixtures";
import { safeCsv } from "./privacy-sanitization-fixtures";
import { RestartObjects } from "./privacy-restart-objects";
import { PrivacyStore } from "@/services/privacy-gateway/durable/store";
import { PrivacyRecovery } from "@/services/privacy-gateway/durable/recovery";
import { authenticateM3 } from "@/services/privacy-gateway/durable/verification";
import { m3References } from "@/services/privacy-gateway/sanitization/service";
import { privacyHash, privacyPolicyContentHash } from "@/services/privacy-gateway/policy";
import { recoveryRole, type RecoveryRuntime, type RecoveryCommand } from "@/services/privacy-gateway/durable/recovery-contracts";
import type { PrivacyRole } from "@/services/privacy-gateway/contracts";

export type RestartConfig = { jobId: string; packageId: string; organizationId: string; clientId: string; attemptId: string;
  key: string; action?: string; crash?: string; revoked?: boolean; now?: string; workerId: string; scanFailure?: boolean;
  actorId?: string; changedRole?: PrivacyRole; scannerVersion?: string; failureReason?: "CANCELLED" | "ABANDONED";
  payload?: "PARSER_FAILURE" | "SANITIZATION_FAILURE" };
export async function restartFixture(root: string, config: RestartConfig) {
  if (process.env.DATABASE_URL !== "postgresql://privacy_test:privacy_test@127.0.0.1:55439/privacy_m4_v3") throw new Error("ISOLATED_CONFIGURATION_REQUIRED");
  const f = privacyFixture(); Object.assign(f.policy.pins, m3References());
  f.policy.pins.sanitization.hash = privacyPolicyContentHash(f.policy);
  const scope = { jobId: config.jobId, packageId: config.packageId, organizationId: config.organizationId, clientId: config.clientId };
  const actors: Record<PrivacyRole, number> = { INTAKE: 10, SANITIZER: 11, VERIFIER: 12, PUBLISHER: 13, DESTROYER: 14, AUDITOR: 15, KEY_ACCESS: 10 };
  const objects = new RestartObjects(root, async (point) => { if (config.crash === point) process.exit(73); });
  const signer = await objects.signer();
  const runtime: RecoveryRuntime = {
    now: () => config.now ?? "2026-10-23T04:00:00.000Z", id: randomUUID, signer, scannerVersion: config.scannerVersion ?? "synthetic-scanner-v1",
    async policy(hash) { if (hash !== privacyHash(f.policy)) throw new Error("POLICY_UNAVAILABLE"); return f.policy; },
    async authorization(_job, actorId) {
      const role = config.actorId === actorId && config.changedRole ? config.changedRole :
        Object.entries(actors).find(([name, id]) => name !== "KEY_ACCESS" && f.actor(id).id === actorId)?.[0] as PrivacyRole | undefined;
      const actor = { ...f.actor(10), id: actorId, active: role === "DESTROYER" || !config.revoked };
      const roles: PrivacyRole[] = role ? [role, ...(["INTAKE", "SANITIZER", "VERIFIER"].includes(role) ? ["KEY_ACCESS" as const] : [])] : [];
      return { actor, grants: f.grants(actor, ...roles).map((g) => ({ ...g, scope, expiresAt: "2026-10-26T04:00:00.000Z" })) };
    },
    async authenticateVerification(bundle) { return authenticateM3(bundle, signer); },
    async scanner() { if (config.crash === "DURING_SCAN") process.exit(73); return config.scanFailure ? "REJECTED" : "CLEAN"; },
    async checkpoint(point) { if (config.crash === point) process.exit(73); },
  };
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), omit: { user: { passwordHash: true } } });
  const store = new PrivacyStore(client, runtime); const recovery = new PrivacyRecovery(store, objects, runtime);
  const cmd = (j: { revision: number; attemptId: string; fence: number }, role: PrivacyRole): RecoveryCommand => ({
    jobId: config.jobId, attemptId: j.attemptId, fence: j.fence, revision: j.revision, actorId: config.actorId ?? f.actor(actors[role]).id,
    workerId: config.workerId, key: randomUUID(),
  });
  return { client, store, recovery, objects, runtime, cmd, f, actors, scope };
}
export async function main() {
  const root = process.env.PRIVACY_RECOVERY_ROOT;
  if (!root) throw new Error("ISOLATED_CONFIGURATION_REQUIRED");
  const config: RestartConfig = JSON.parse(await readFile(join(root, "command.json"), "utf8"));
  const { client, recovery, cmd, f, scope } = await restartFixture(root, config);
  const payload = () => config.payload ? new TextEncoder().encode(config.payload === "PARSER_FAILURE" ?
    `${new TextDecoder().decode(safeCsv())}\n"unterminated` :
    new TextDecoder().decode(safeCsv()).replaceAll("RENT", "UNSUPPORTED_PRIVATE_TEXT")) : safeCsv();
  try {
    if (config.action === "admit") {
      const bytes = payload();
      const { artifactChecksum } = await import("@/services/privacy-gateway/durable/recovery");
      await recovery.admit({ ...scope, ownerId: f.actor(10).id, purposeId: randomUUID(), usageBasisId: randomUUID(),
        attemptId: config.attemptId, fence: 1, policyHash: privacyHash(f.policy), checksum: artifactChecksum(bytes),
        size: bytes.length, media: "CSV", key: config.key });
    } else {
      let job = await client.privacyAdmission.findUniqueOrThrow({ where: { id: config.jobId } });
      if (config.action === "cleanup") {
        if (!job.revokedAt) job = await recovery.fail(cmd(job, "DESTROYER"), config.failureReason ?? (config.revoked ? "REVOKED" : "EXPIRED"));
        await recovery.cleanup(cmd(job, "DESTROYER"));
      } else if (config.action === "deny-raw") {
        const raw = await client.privacyInventoryArtifact.findFirstOrThrow({ where: { jobId: job.id, kind: "ORIGINAL" } });
        await recovery.assertObject(raw, false);
      } else if (config.action === "claim") {
        await recovery.claim(cmd(job, recoveryRole(job.state)));
      } else {
        const role = recoveryRole(job.state);
        job = await recovery.claim(cmd(job, role));
        await recovery.advance(cmd(job, role), payload());
      }
    }
    process.stdout.write("RECOVERY_STEP_OK");
  } catch (error) {
    // Only a repository safe code crosses the process boundary.
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "RECOVERY_FAILED";
    process.stderr.write(code); process.exitCode = 1;
  } finally { await client.$disconnect(); }
}
