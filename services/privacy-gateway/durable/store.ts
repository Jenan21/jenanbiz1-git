import { Prisma, type PrivacyDurableJob, type PrivacyDurableWork } from "@/generated/prisma/client";
import { type db, type DbExecutor } from "@/lib/db";
import { opaqueIdSchema, PrivacyError, type PrivacyRole, type PrivacyScope } from "../contracts";
import { assertPrivacyRole, parsePrivacy, privacyHash } from "../policy";
import { adapterResult, commandSchema, DurablePrivacyError, type DurableCommand, type DurableRuntime } from "./contracts";
import type { IntakeRuntime } from "../intake/contracts";

export type DurableJob = PrivacyDurableJob;
export type DurableWork = PrivacyDurableWork;
export type DurableTx = DbExecutor;
const zero = "0".repeat(64);
export function jobScope(job: DurableJob): PrivacyScope {
  return { organizationId: job.organizationId, clientId: job.clientId, packageId: job.packageId, jobId: job.id };
}
export class PrivacyStore {
  constructor(readonly client: typeof db, readonly runtime: DurableRuntime) {}
  async authorize(job: DurableJob, actorId: string, role: PrivacyRole) {
    try {
      const current = await this.runtime.authorization(job.id, actorId);
      if (current.actor.id !== actorId) throw new DurablePrivacyError("AUTHORIZATION_DENIED");
      assertPrivacyRole(current.actor, current.grants, role, jobScope(job), this.runtime.now());
    } catch { throw new DurablePrivacyError("AUTHORIZATION_DENIED"); }
    if (role === "PUBLISHER" && [job.ownerId, job.sanitizerId, job.verifierId, ...job.processorIds].includes(actorId)) {
      throw new DurablePrivacyError("AUTHORIZATION_DENIED");
    }
  }
  async read(jobId: string, actorId: string, role: PrivacyRole) {
    parsePrivacy(opaqueIdSchema, jobId); parsePrivacy(opaqueIdSchema, actorId);
    const job = await adapterResult(() => this.client.privacyDurableJob.findUnique({ where: { id: jobId } }));
    if (!job) throw new DurablePrivacyError("AUTHORIZATION_DENIED");
    await this.authorize(job, actorId, role);
    return job;
  }
  async committed(command: DurableCommand, job: DurableJob, action: string, intent: unknown) {
    parsePrivacy(commandSchema, command);
    if (job.attemptId !== command.attemptId || job.fence !== command.fence) throw new DurablePrivacyError("STALE_ATTEMPT");
    const event = await adapterResult(() => this.client.privacyDurableEvent.findUnique({
      where: { jobId_idempotencyKey: { jobId: job.id, idempotencyKey: command.key } },
    }));
    if (!event) return false;
    const hash = privacyHash({ action, intent, attemptId: command.attemptId, fence: command.fence, revision: command.revision });
    if (event.intentHash !== hash || event.actorId !== command.actorId || event.action !== action) throw new DurablePrivacyError("IDEMPOTENCY_CONFLICT");
    return true;
  }
  async rawAllowed(jobId: string, actorId: string, role: "SANITIZER" | "VERIFIER") {
    const job = await this.read(jobId, actorId, role);
    if (job.revokedAt || job.rawExpiresAt.toISOString() <= this.runtime.now() || job.destruction !== "RAW_PRESENT") {
      throw new DurablePrivacyError("AUTHORIZATION_DENIED");
    }
    await this.authorize(job, actorId, "KEY_ACCESS");
    return true;
  }
  rawAuthorization(underlying: IntakeRuntime["currentAuthorization"]): IntakeRuntime["currentAuthorization"] {
    return async (snapshot, actorId) => {
      try {
        const current = await underlying(snapshot, actorId);
        const enrolled = await this.client.privacyDurableJob.findUnique({ where: { id: snapshot.scope.jobId } });
        if (enrolled && (enrolled.attemptId !== snapshot.attemptId || enrolled.fence !== snapshot.fence ||
          enrolled.revokedAt || enrolled.destruction !== "RAW_PRESENT" ||
          enrolled.rawExpiresAt.toISOString() <= this.runtime.now())) throw new DurablePrivacyError("AUTHORIZATION_DENIED");
        return current;
      } catch { throw new DurablePrivacyError("AUTHORIZATION_DENIED"); }
    };
  }
  async event(tx: DurableTx, job: DurableJob, actorId: string, role: PrivacyRole,
    action: string, result: string, key: string, intentHash: string) {
    const prior = await tx.privacyDurableEvent.findFirst({ where: { jobId: job.id }, orderBy: { sequence: "desc" } });
    const current = await tx.privacyDurableJob.findUniqueOrThrow({ where: { id: job.id } });
    const event = { jobId: job.id, sequence: prior ? prior.sequence + 1 : 0, actorId, role, action, result,
      revision: current.revision, key, intentHash, previousHash: prior?.eventHash ?? zero, at: this.runtime.now() };
    const { key: idempotencyKey, ...fields } = event;
    await tx.privacyDurableEvent.create({ data: { ...fields, idempotencyKey,
      at: new Date(event.at), eventHash: privacyHash(event) } });
  }
  async run<T>(raw: DurableCommand, role: PrivacyRole, action: string, intent: unknown,
    work: (tx: DurableTx, job: DurableJob, replay: boolean) => Promise<T>): Promise<T> {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) throw new DurablePrivacyError("STALE_ATTEMPT");
    const cmd = parsed.data; const intentHash = privacyHash({ action, intent, attemptId: cmd.attemptId, fence: cmd.fence, revision: cmd.revision });
    try {
      return await this.client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "PrivacyDurableJob" WHERE "id"=${cmd.jobId}::uuid FOR UPDATE`;
        const job = await tx.privacyDurableJob.findUnique({ where: { id: cmd.jobId } });
        if (!job) throw new DurablePrivacyError("AUTHORIZATION_DENIED");
        await this.authorize(job, cmd.actorId, role);
        if (job.attemptId !== cmd.attemptId || job.fence !== cmd.fence) throw new DurablePrivacyError("STALE_ATTEMPT");
        const old = await tx.privacyDurableEvent.findUnique({ where: { jobId_idempotencyKey: { jobId: job.id, idempotencyKey: cmd.key } } });
        if (old) {
          if (old.intentHash !== intentHash || old.actorId !== cmd.actorId || old.action !== action) throw new DurablePrivacyError("IDEMPOTENCY_CONFLICT");
          return work(tx, job, true);
        }
        if (job.revision !== cmd.revision) throw new DurablePrivacyError("STALE_REVISION");
        const result = await work(tx, job, false);
        await this.authorize(job, cmd.actorId, role);
        await this.event(tx, job, cmd.actorId, role, action, "COMPLETED", cmd.key, intentHash);
        return result;
      }, { timeout: 30_000, maxWait: 10_000 });
    } catch (error) {
      if (error instanceof DurablePrivacyError) throw error;
      if (error instanceof PrivacyError) throw new PrivacyError(error.code);
      // Never return ORM/driver errors, SQL or parameters.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new DurablePrivacyError("IDEMPOTENCY_CONFLICT");
      throw new DurablePrivacyError("ADAPTER_UNAVAILABLE");
    }
  }
  async update(tx: DurableTx, job: DurableJob, data: Prisma.PrivacyDurableJobUpdateInput) {
    return tx.privacyDurableJob.update({ where: { id: job.id }, data: { ...data, revision: job.revision + 1, updatedAt: new Date(this.runtime.now()) } });
  }
  async audit(jobId: string, actorId: string) {
    await this.read(jobId, actorId, "AUDITOR");
    const events = await this.client.privacyDurableEvent.findMany({ where: { jobId }, orderBy: { sequence: "asc" } });
    let previousHash = zero;
    for (const [sequence, event] of events.entries()) {
      const calculated = privacyHash({ jobId, sequence, actorId: event.actorId, role: event.role,
        action: event.action, result: event.result, key: event.idempotencyKey, intentHash: event.intentHash,
        revision: event.revision, previousHash: event.previousHash, at: event.at.toISOString() });
      if (event.sequence !== sequence || event.previousHash !== previousHash || event.eventHash !== calculated) throw new DurablePrivacyError("AUDIT_TAMPERED");
      previousHash = event.eventHash;
    }
    return events;
  }
}
