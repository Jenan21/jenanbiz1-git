import { AcademyQueueItemStatus, AIProviderReadiness, Prisma, SandboxLabRunStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { writeAcademyAudit } from "@/services/academy/workforce-service";

type QueueKind = "ADMISSION" | "ENROLLMENT" | "EXAMINATION" | "CERTIFICATION" | "RETRAINING" | "RECERTIFICATION" | "CURRICULUM_CHANGE" | "GEOGRAPHY_REFRESH";

export async function ensureAcademyQueue(input: { academyId: string; key: string; name: string; concurrency?: number }, actorId?: string) {
  if (!Number.isInteger(input.concurrency ?? 1) || (input.concurrency ?? 1) < 1) throw new Error("Queue concurrency must be at least one");
  const queue = await db.academyWorkQueue.upsert({
    where: { academyId_key: { academyId: input.academyId, key: input.key } },
    update: { name: input.name, concurrency: input.concurrency ?? 1 },
    create: { academyId: input.academyId, key: input.key, name: input.name, concurrency: input.concurrency ?? 1 },
  });
  await writeAcademyAudit({ actorId, action: "ACADEMY_QUEUE_ENSURED", entityType: "AcademyWorkQueue", entityId: queue.id, metadata: { key: queue.key } });
  return queue;
}

export async function enqueueAcademyWork(input: {
  queueId: string;
  kind: QueueKind;
  idempotencyKey: string;
  profileId?: string;
  payload?: Prisma.InputJsonValue;
  priority?: number;
  availableAt?: Date;
  maxAttempts?: number;
}, actorId?: string) {
  if (!input.idempotencyKey.trim()) throw new Error("idempotencyKey is required");
  const item = await db.academyQueueItem.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      queueId: input.queueId,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      profileId: input.profileId,
      payload: input.payload,
      priority: input.priority ?? 0,
      availableAt: input.availableAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 3,
    },
  });
  await writeAcademyAudit({ actorId, action: "ACADEMY_WORK_ENQUEUED", entityType: "AcademyQueueItem", entityId: item.id, metadata: { kind: item.kind, idempotencyKey: item.idempotencyKey } });
  return item;
}

export async function claimAcademyWork(queueId: string, leaseMilliseconds = 60_000, actorId?: string) {
  if (!Number.isInteger(leaseMilliseconds) || leaseMilliseconds < 1_000) throw new Error("Lease duration must be at least one second");
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMilliseconds);
  const leaseToken = crypto.randomUUID();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const claimed = await db.$transaction(async (transaction) => {
      const queue = await transaction.academyWorkQueue.findUnique({ where: { id: queueId } });
      if (!queue || queue.paused) return null;
      const activeLeases = await transaction.academyQueueItem.count({ where: { queueId, status: "LEASED", leaseExpiresAt: { gt: now } } });
      if (activeLeases >= queue.concurrency) return null;
      const candidates = await transaction.academyQueueItem.findMany({
        where: {
          queueId,
          OR: [
            { status: "PENDING", availableAt: { lte: now } },
            { status: "FAILED", availableAt: { lte: now } },
            { status: "LEASED", leaseExpiresAt: { lte: now } },
          ],
        },
        orderBy: [{ priority: "desc" }, { availableAt: "asc" }, { createdAt: "asc" }],
        take: 25,
      });
      const candidate = candidates.find((item) => item.attempts < item.maxAttempts);
      if (!candidate || candidate.attempts >= candidate.maxAttempts) return null;
      const updated = await transaction.academyQueueItem.updateMany({
        where: { id: candidate.id, status: candidate.status, ...(candidate.status === "LEASED" ? { leaseExpiresAt: { lte: now } } : {}) },
        data: { status: "LEASED", leaseToken, leasedAt: now, leaseExpiresAt, attempts: { increment: 1 }, lastError: null },
      });
      if (updated.count !== 1) return null;
      return transaction.academyQueueItem.findUniqueOrThrow({ where: { id: candidate.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (claimed) {
      await writeAcademyAudit({ actorId, action: "ACADEMY_WORK_LEASED", entityType: "AcademyQueueItem", entityId: claimed.id, metadata: { leaseToken } });
      return claimed;
    }
  }
  return null;
}

export async function completeAcademyWork(input: { itemId: string; leaseToken: string }, actorId?: string) {
  const result = await db.academyQueueItem.updateMany({
    where: { id: input.itemId, status: "LEASED", leaseToken: input.leaseToken },
    data: { status: "COMPLETED", leaseExpiresAt: null, leaseToken: null },
  });
  if (result.count !== 1) throw new Error("Queue lease is no longer owned by this worker");
  const item = await db.academyQueueItem.findUniqueOrThrow({ where: { id: input.itemId } });
  await writeAcademyAudit({ actorId, action: "ACADEMY_WORK_COMPLETED", entityType: "AcademyQueueItem", entityId: item.id });
  return item;
}

export async function failAcademyWork(input: { itemId: string; leaseToken: string; error: string; retryAfterMilliseconds?: number }, actorId?: string) {
  const item = await db.academyQueueItem.findUnique({ where: { id: input.itemId } });
  if (!item || item.status !== "LEASED" || item.leaseToken !== input.leaseToken) throw new Error("Queue lease is no longer owned by this worker");
  const status: AcademyQueueItemStatus = item.attempts >= item.maxAttempts ? "DEAD_LETTER" : "FAILED";
  const updated = await db.academyQueueItem.update({
    where: { id: input.itemId },
    data: {
      status,
      lastError: input.error.slice(0, 2_000),
      leaseToken: null,
      leaseExpiresAt: null,
      availableAt: new Date(Date.now() + (input.retryAfterMilliseconds ?? 0)),
    },
  });
  await writeAcademyAudit({ actorId, action: status === "DEAD_LETTER" ? "ACADEMY_WORK_DEAD_LETTERED" : "ACADEMY_WORK_FAILED", entityType: "AcademyQueueItem", entityId: updated.id, reason: updated.lastError ?? undefined });
  return updated;
}

export async function createSandboxLabRun(input: { profileId: string; labId: string; idempotencyKey: string; input?: Prisma.InputJsonValue }, actorId?: string) {
  const lab = await db.academyLab.findUnique({ where: { id: input.labId } });
  if (!lab) throw new Error("Academy lab not found");
  const status: SandboxLabRunStatus = lab.providerReadiness === AIProviderReadiness.AWAITING_AI_PROVIDER ? "AWAITING_AI_PROVIDER" : "QUEUED";
  const run = await db.sandboxLabRun.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: { profileId: input.profileId, labId: input.labId, idempotencyKey: input.idempotencyKey, input: input.input, status, providerState: lab.providerReadiness },
  });
  await writeAcademyAudit({ actorId, action: "SANDBOX_LAB_RUN_CREATED", entityType: "SandboxLabRun", entityId: run.id, metadata: { status: run.status, providerState: run.providerState } });
  return run;
}

export async function completeLocalSandboxLabRun(input: { runId: string; evidence: Prisma.InputJsonValue; output?: Prisma.InputJsonValue; passed: boolean }, actorId?: string) {
  const run = await db.sandboxLabRun.findUnique({ where: { id: input.runId } });
  if (!run) throw new Error("Sandbox lab run not found");
  if (run.providerState === AIProviderReadiness.AWAITING_AI_PROVIDER) throw new Error("Sandbox run awaits AI provider");
  if (run.status === "PASSED" || run.status === "FAILED") return run;
  const updated = await db.sandboxLabRun.update({
    where: { id: run.id },
    data: { status: input.passed ? "PASSED" : "FAILED", output: input.output, evidence: input.evidence, startedAt: run.startedAt ?? new Date(), completedAt: new Date() },
  });
  await writeAcademyAudit({ actorId, action: "SANDBOX_LAB_RUN_COMPLETED", entityType: "SandboxLabRun", entityId: updated.id, metadata: { status: updated.status } });
  return updated;
}

export type AcademyWorkHandler = (item: NonNullable<Awaited<ReturnType<typeof claimAcademyWork>>>) => Promise<void>;

export async function processAcademyQueueOnce(queueId: string, handler: AcademyWorkHandler, actorId?: string) {
  const item = await claimAcademyWork(queueId, 60_000, actorId);
  if (!item) return { processed: false as const, item: null };
  try {
    await handler(item);
    const completed = await completeAcademyWork({ itemId: item.id, leaseToken: item.leaseToken! }, actorId);
    return { processed: true as const, item: completed };
  } catch (error) {
    await failAcademyWork({
      itemId: item.id,
      leaseToken: item.leaseToken!,
      error: error instanceof Error ? error.message : "Unknown queue handler failure",
      retryAfterMilliseconds: 5_000,
    }, actorId);
    throw error;
  }
}

export type LocalSandboxExecutor = (input: { runId: string; profileId: string; labId: string; payload: Prisma.JsonValue | null }) => Promise<{ evidence: Prisma.InputJsonValue; output?: Prisma.InputJsonValue; passed: boolean }>;

export async function executeLocalSandboxLabRun(runId: string, executor: LocalSandboxExecutor, actorId?: string) {
  const run = await db.sandboxLabRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error("Sandbox lab run not found");
  if (run.providerState === AIProviderReadiness.AWAITING_AI_PROVIDER) throw new Error("Sandbox run awaits AI provider");
  if (run.status === "PASSED" || run.status === "FAILED") return run;
  const running = await db.sandboxLabRun.update({ where: { id: run.id }, data: { status: "RUNNING", startedAt: new Date() } });
  try {
    const result = await executor({ runId: running.id, profileId: running.profileId, labId: running.labId, payload: running.input });
    return completeLocalSandboxLabRun({ runId: running.id, ...result }, actorId);
  } catch (error) {
    const failed = await db.sandboxLabRun.update({
      where: { id: running.id },
      data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 2_000) : "Unknown sandbox executor failure", completedAt: new Date() },
    });
    await writeAcademyAudit({ actorId, action: "SANDBOX_LAB_RUN_FAILED", entityType: "SandboxLabRun", entityId: failed.id, reason: failed.error ?? undefined });
    throw error;
  }
}