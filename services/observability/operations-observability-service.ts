import { randomUUID } from "node:crypto";

import { BackupRecordStatus, IncidentStatus, OperationalAlertSeverity, OperationsJobStatus, Prisma, RestoreDrillStatus, WorkerNodeStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export async function recordWorkerHeartbeat(input: { activeJobs?: number; capabilities?: Prisma.InputJsonValue; key: string; loadPercent?: number; metadata?: Prisma.InputJsonValue; name: string; status: WorkerNodeStatus; traceId?: string; version?: string }) {
  return db.$transaction(async (transaction) => {
    const worker = await transaction.workerNode.upsert({ where: { key: input.key }, create: { capabilities: input.capabilities, key: input.key, lastHeartbeatAt: new Date(), name: input.name, status: input.status, version: input.version }, update: { capabilities: input.capabilities, lastHeartbeatAt: new Date(), name: input.name, status: input.status, version: input.version } });
    await transaction.workerHeartbeat.create({ data: { activeJobs: input.activeJobs ?? 0, loadPercent: input.loadPercent ?? 0, metadata: input.metadata, status: input.status, traceId: input.traceId, workerId: worker.id } });
    return worker;
  });
}

export async function markStaleWorkersOffline(staleAfterSeconds = 90) {
  const threshold = new Date(Date.now() - staleAfterSeconds * 1000);
  return db.workerNode.updateMany({ where: { lastHeartbeatAt: { lt: threshold }, status: { in: [WorkerNodeStatus.ONLINE, WorkerNodeStatus.DEGRADED] } }, data: { status: WorkerNodeStatus.OFFLINE } });
}

export function ensureOperationsQueue(input: { concurrency?: number; key: string; name: string }) {
  return db.operationsQueue.upsert({ where: { key: input.key }, create: { concurrency: input.concurrency ?? 1, key: input.key, name: input.name }, update: { concurrency: input.concurrency ?? 1, name: input.name } });
}

export async function enqueueOperationsJob(input: { idempotencyKey: string; kind: string; maxAttempts?: number; payload?: Prisma.InputJsonValue; priority?: number; queueId: string; traceId?: string }) {
  return db.operationsJob.upsert({ where: { idempotencyKey: input.idempotencyKey }, create: { ...input, maxAttempts: input.maxAttempts ?? 3, priority: input.priority ?? 0, traceId: input.traceId ?? randomUUID() }, update: {} });
}

export async function leaseNextOperationsJob(input: { leaseSeconds?: number; queueId: string; workerId: string }) {
  return db.$transaction(async (transaction) => {
    const queue = await transaction.operationsQueue.findUnique({ where: { id: input.queueId } });
    if (!queue || queue.paused) return null;
    const worker = await transaction.workerNode.findUnique({ where: { id: input.workerId } });
    if (!worker || worker.status !== WorkerNodeStatus.ONLINE) throw new Error("Worker is not online");
    const candidate = await transaction.operationsJob.findFirst({ where: { availableAt: { lte: new Date() }, queueId: queue.id, status: { in: [OperationsJobStatus.QUEUED, OperationsJobStatus.RETRYING] } }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }] });
    if (!candidate) return null;
    const claimed = await transaction.operationsJob.updateMany({ where: { id: candidate.id, status: candidate.status }, data: { attempts: { increment: 1 }, leasedAt: new Date(), leaseExpiresAt: new Date(Date.now() + (input.leaseSeconds ?? 60) * 1000), status: OperationsJobStatus.LEASED, workerId: worker.id } });
    if (claimed.count !== 1) return null;
    await transaction.systemLog.create({ data: { level: "INFO", message: `Leased ${candidate.kind}`, metadata: { jobId: candidate.id, workerId: worker.id }, source: "operations-queue", traceId: candidate.traceId } });
    return transaction.operationsJob.findUnique({ where: { id: candidate.id } });
  });
}

export async function failOperationsJob(jobId: string, error: string) {
  return db.$transaction(async (transaction) => {
    const job = await transaction.operationsJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error("Operations job not found");
    if (job.status !== OperationsJobStatus.LEASED) throw new Error("Operations job is not leased");
    const retrying = job.attempts < job.maxAttempts;
    const status = retrying ? OperationsJobStatus.RETRYING : OperationsJobStatus.DEAD_LETTER;
    const updated = await transaction.operationsJob.update({ where: { id: job.id }, data: { availableAt: retrying ? new Date(Date.now() + Math.min(3600, 2 ** job.attempts * 30) * 1000) : job.availableAt, lastError: error, leaseExpiresAt: null, status, workerId: null } });
    const incident = !retrying ? await transaction.operationalIncident.create({ data: { severity: OperationalAlertSeverity.CRITICAL, summary: error, title: `Dead-letter job: ${job.kind}`, traceId: job.traceId } }) : null;
    await transaction.operationalAlert.create({ data: { details: error, entityId: job.id, entityType: "OperationsJob", incidentId: incident?.id, severity: retrying ? OperationalAlertSeverity.ERROR : OperationalAlertSeverity.CRITICAL, source: "operations-queue", title: retrying ? `Job retry scheduled: ${job.kind}` : `Job moved to dead letter: ${job.kind}`, traceId: job.traceId } });
    await transaction.systemLog.create({ data: { level: retrying ? "ERROR" : "CRITICAL", message: error, metadata: { attempts: job.attempts, jobId: job.id, status }, source: "operations-queue", traceId: job.traceId } });
    return updated;
  });
}

export function retryOperationsJob(jobId: string) {
  return db.operationsJob.update({ where: { id: jobId }, data: { availableAt: new Date(), lastError: null, leaseExpiresAt: null, status: OperationsJobStatus.RETRYING, workerId: null } });
}

export function completeOperationsJob(jobId: string, output?: Prisma.InputJsonValue) {
  return db.operationsJob.update({ where: { id: jobId }, data: { completedAt: new Date(), leaseExpiresAt: null, output, status: OperationsJobStatus.SUCCEEDED } });
}

export function recordSystemLog(input: { level: string; message: string; metadata?: Prisma.InputJsonValue; source: string; traceId?: string }) {
  return db.systemLog.create({ data: input });
}

export function updateOperationalAlert(alertId: string, status: "ACKNOWLEDGED" | "RESOLVED") {
  return db.operationalAlert.update({ where: { id: alertId }, data: { acknowledgedAt: status === "ACKNOWLEDGED" ? new Date() : undefined, resolvedAt: status === "RESOLVED" ? new Date() : undefined, status } });
}

export function updateOperationalIncident(incidentId: string, status: IncidentStatus) {
  return db.operationalIncident.update({ where: { id: incidentId }, data: { resolvedAt: status === IncidentStatus.RESOLVED ? new Date() : undefined, status } });
}

export function recordBackup(input: { checksum?: string; error?: string; provider: string; sizeBytes?: bigint; status: BackupRecordStatus; storageKey?: string }) {
  return db.backupRecord.create({ data: { ...input, completedAt: input.status === BackupRecordStatus.RUNNING ? undefined : new Date() } });
}

export function recordRestoreDrill(input: { backupId: string; error?: string; evidence?: Prisma.InputJsonValue; status: RestoreDrillStatus; target: string }) {
  const completed = input.status === RestoreDrillStatus.SUCCEEDED || input.status === RestoreDrillStatus.FAILED;
  return db.restoreDrill.create({ data: { ...input, completedAt: completed ? new Date() : undefined, startedAt: input.status === RestoreDrillStatus.PLANNED ? undefined : new Date() } });
}

export async function getOperationsObservabilitySnapshot() {
  await markStaleWorkersOffline();
  const [workers, queues, jobs, alerts, incidents, logs, backups, drills] = await Promise.all([
    db.workerNode.findMany({ include: { _count: { select: { heartbeats: true, jobs: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.operationsQueue.findMany({ include: { _count: { select: { jobs: true } } }, orderBy: { name: "asc" }, take: 100 }),
    db.operationsJob.findMany({ include: { queue: { select: { name: true } }, worker: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.operationalAlert.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    db.operationalIncident.findMany({ orderBy: { openedAt: "desc" }, take: 100 }),
    db.systemLog.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    db.backupRecord.findMany({ orderBy: { startedAt: "desc" }, take: 100 }),
    db.restoreDrill.findMany({ include: { backup: { select: { provider: true, storageKey: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return { alerts, backups, drills, incidents, jobs, logs, queues, workers };
}