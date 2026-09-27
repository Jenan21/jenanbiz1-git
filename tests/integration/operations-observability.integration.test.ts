import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { BackupRecordStatus, RestoreDrillStatus, WorkerNodeStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  completeOperationsJob,
  enqueueOperationsJob,
  ensureOperationsQueue,
  failOperationsJob,
  getOperationsObservabilitySnapshot,
  leaseNextOperationsJob,
  recordBackup,
  recordRestoreDrill,
  recordSystemLog,
  recordWorkerHeartbeat,
  retryOperationsJob,
} from "@/services/observability/operations-observability-service";

describe("operations observability", () => {
  let queueId = "";
  let workerId = "";
  let backupId = "";

  it("tracks heartbeats, queue retries, incidents, logs, backup and restore drills", async () => {
    const suffix = randomUUID();
    const worker = await recordWorkerHeartbeat({ activeJobs: 0, capabilities: ["missions"], key: `worker-${suffix}`, loadPercent: 12, name: "E2E Worker", status: WorkerNodeStatus.ONLINE, traceId: suffix, version: "1.0.0" });
    workerId = worker.id;
    const queue = await ensureOperationsQueue({ concurrency: 2, key: `queue-${suffix}`, name: "E2E Operations Queue" });
    queueId = queue.id;
    const job = await enqueueOperationsJob({ idempotencyKey: `job-${suffix}`, kind: "MISSION", maxAttempts: 2, payload: { mission: "test" }, priority: 10, queueId: queue.id, traceId: suffix });
    expect((await enqueueOperationsJob({ idempotencyKey: `job-${suffix}`, kind: "MISSION", queueId: queue.id })).id).toBe(job.id);
    const firstLease = await leaseNextOperationsJob({ queueId: queue.id, workerId: worker.id });
    expect(firstLease?.status).toBe("LEASED");
    expect((await failOperationsJob(job.id, "First failure")).status).toBe("RETRYING");
    await retryOperationsJob(job.id);
    await leaseNextOperationsJob({ queueId: queue.id, workerId: worker.id });
    expect((await failOperationsJob(job.id, "Second failure")).status).toBe("DEAD_LETTER");

    const successfulJob = await enqueueOperationsJob({ idempotencyKey: `success-${suffix}`, kind: "REPORT", queueId: queue.id });
    await leaseNextOperationsJob({ queueId: queue.id, workerId: worker.id });
    expect((await completeOperationsJob(successfulJob.id, { done: true })).status).toBe("SUCCEEDED");
    await recordSystemLog({ level: "INFO", message: "Trace captured", source: "e2e", traceId: suffix });
    const backup = await recordBackup({ checksum: "sha256:test", provider: "local-test", sizeBytes: BigInt(1024), status: BackupRecordStatus.SUCCEEDED, storageKey: `backup-${suffix}` });
    backupId = backup.id;
    await recordRestoreDrill({ backupId: backup.id, evidence: { verified: true }, status: RestoreDrillStatus.SUCCEEDED, target: `restore-${suffix}` });

    const snapshot = await getOperationsObservabilitySnapshot();
    expect(snapshot.workers.find((item) => item.id === worker.id)?.status).toBe("ONLINE");
    expect(snapshot.jobs.find((item) => item.id === job.id)?.status).toBe("DEAD_LETTER");
    expect(snapshot.alerts.some((item) => item.traceId === suffix && item.severity === "CRITICAL")).toBe(true);
    expect(snapshot.incidents.some((item) => item.traceId === suffix)).toBe(true);
    expect(snapshot.logs.some((item) => item.traceId === suffix)).toBe(true);
    expect(snapshot.drills.find((item) => item.backupId === backup.id)?.status).toBe("SUCCEEDED");
  });

  afterAll(async () => {
    if (queueId) await db.operationsQueue.delete({ where: { id: queueId } }).catch(() => undefined);
    if (workerId) await db.workerNode.delete({ where: { id: workerId } }).catch(() => undefined);
    if (backupId) await db.backupRecord.delete({ where: { id: backupId } }).catch(() => undefined);
    await db.systemLog.deleteMany({ where: { source: "e2e" } });
    await db.$disconnect();
  });
});