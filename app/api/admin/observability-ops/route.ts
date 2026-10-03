import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { BackupRecordStatus, IncidentStatus, Prisma, RestoreDrillStatus, WorkerNodeStatus } from "@/generated/prisma/client";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
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
  updateOperationalAlert,
  updateOperationalIncident,
} from "@/services/observability/operations-observability-service";

const jsonObject = z.record(z.string(), z.unknown());
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("heartbeat"), activeJobs: z.number().int().nonnegative().optional(), capabilities: z.array(z.string().trim()).max(100).optional(), key: z.string().trim().min(2).max(160), loadPercent: z.number().int().min(0).max(100).optional(), metadata: jsonObject.optional(), name: z.string().trim().min(2).max(240), status: z.nativeEnum(WorkerNodeStatus), traceId: z.string().uuid().optional(), version: z.string().trim().max(80).optional() }),
  z.object({ action: z.literal("ensureQueue"), concurrency: z.number().int().min(1).max(100).optional(), key: z.string().trim().min(2).max(160), name: z.string().trim().min(2).max(240) }),
  z.object({ action: z.literal("enqueue"), idempotencyKey: z.string().trim().min(4).max(240), kind: z.string().trim().min(2).max(160), maxAttempts: z.number().int().min(1).max(20).optional(), payload: jsonObject.optional(), priority: z.number().int().min(0).max(100).optional(), queueId: z.string().cuid(), traceId: z.string().uuid().optional() }),
  z.object({ action: z.literal("lease"), leaseSeconds: z.number().int().min(1).max(3600).optional(), queueId: z.string().cuid(), workerId: z.string().cuid() }),
  z.object({ action: z.literal("failJob"), error: z.string().trim().min(2).max(4000), jobId: z.string().cuid() }),
  z.object({ action: z.literal("retryJob"), jobId: z.string().cuid() }),
  z.object({ action: z.literal("completeJob"), jobId: z.string().cuid(), output: jsonObject.optional() }),
  z.object({ action: z.literal("recordLog"), level: z.string().trim().min(2).max(40), message: z.string().trim().min(2).max(10_000), metadata: jsonObject.optional(), source: z.string().trim().min(2).max(160), traceId: z.string().uuid().optional() }),
  z.object({ action: z.literal("updateAlert"), alertId: z.string().cuid(), status: z.enum(["ACKNOWLEDGED", "RESOLVED"]) }),
  z.object({ action: z.literal("updateIncident"), incidentId: z.string().cuid(), status: z.nativeEnum(IncidentStatus) }),
  z.object({ action: z.literal("recordBackup"), checksum: z.string().trim().max(240).optional(), error: z.string().trim().max(4000).optional(), provider: z.string().trim().min(2).max(160), sizeBytes: z.number().int().nonnegative().optional(), status: z.nativeEnum(BackupRecordStatus), storageKey: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("recordRestoreDrill"), backupId: z.string().cuid(), error: z.string().trim().max(4000).optional(), evidence: jsonObject.optional(), status: z.nativeEnum(RestoreDrillStatus), target: z.string().trim().min(2).max(500) }),
]);

function serialize<T>(value: T): T { return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item)) as T; }

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  return NextResponse.json({ success: true, snapshot: serialize(await getOperationsObservabilitySnapshot()) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid observability command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "heartbeat" ? await recordWorkerHeartbeat({ activeJobs: input.activeJobs, capabilities: input.capabilities, key: input.key, loadPercent: input.loadPercent, metadata: input.metadata as Prisma.InputJsonValue | undefined, name: input.name, status: input.status, traceId: input.traceId, version: input.version })
      : input.action === "ensureQueue" ? await ensureOperationsQueue({ concurrency: input.concurrency, key: input.key, name: input.name })
      : input.action === "enqueue" ? await enqueueOperationsJob({ idempotencyKey: input.idempotencyKey, kind: input.kind, maxAttempts: input.maxAttempts, payload: input.payload as Prisma.InputJsonValue | undefined, priority: input.priority, queueId: input.queueId, traceId: input.traceId })
      : input.action === "lease" ? await leaseNextOperationsJob({ leaseSeconds: input.leaseSeconds, queueId: input.queueId, workerId: input.workerId })
      : input.action === "failJob" ? await failOperationsJob(input.jobId, input.error)
      : input.action === "retryJob" ? await retryOperationsJob(input.jobId)
      : input.action === "completeJob" ? await completeOperationsJob(input.jobId, input.output as Prisma.InputJsonValue | undefined)
      : input.action === "recordLog" ? await recordSystemLog({ level: input.level, message: input.message, metadata: input.metadata as Prisma.InputJsonValue | undefined, source: input.source, traceId: input.traceId })
      : input.action === "updateAlert" ? await updateOperationalAlert(input.alertId, input.status)
      : input.action === "updateIncident" ? await updateOperationalIncident(input.incidentId, input.status)
      : input.action === "recordBackup" ? await recordBackup({ checksum: input.checksum, error: input.error, provider: input.provider, sizeBytes: input.sizeBytes === undefined ? undefined : BigInt(input.sizeBytes), status: input.status, storageKey: input.storageKey })
      : await recordRestoreDrill({ backupId: input.backupId, error: input.error, evidence: input.evidence as Prisma.InputJsonValue | undefined, status: input.status, target: input.target });
    return NextResponse.json({ success: true, result: serialize(result) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Observability command failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}