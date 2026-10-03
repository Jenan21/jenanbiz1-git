"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Row = Record<string, string | number | boolean | null>;

export function ObservabilityActions({ backups, jobs, queues, workers }: { backups: Row[]; jobs: Row[]; queues: Row[]; workers: Row[] }) {
  const router = useRouter();
  const [state, setState] = useState({ busy: false, message: "" });
  const queue = queues[0]; const worker = workers[0];
  async function execute(payload: Record<string, unknown>) {
    setState({ busy: true, message: "" });
    try { const response = await fetch("/api/admin/observability-ops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.message ?? "تعذر تنفيذ أمر المراقبة"); setState({ busy: false, message: "تم تسجيل العملية." }); router.refresh(); }
    catch (error) { setState({ busy: false, message: error instanceof Error ? error.message : "تعذر تنفيذ الأمر" }); }
  }
  return <section className="mission-engine-console"><header><div><span>OBSERVABILITY OPS</span><h2>العمال والطوابير والاستعادة</h2></div><strong>TRACEABLE</strong></header><div className="mission-engine-console__commands"><button disabled={state.busy} onClick={() => void execute({ action: "heartbeat", activeJobs: 0, capabilities: ["missions", "reports"], key: "local-control-worker", loadPercent: 0, name: "Local Control Worker", status: "ONLINE", version: "1.0.0" })}>تسجيل Heartbeat</button><button disabled={state.busy} onClick={() => void execute({ action: "ensureQueue", concurrency: 2, key: "platform-operations", name: "Platform Operations" })}>تهيئة Queue</button><button disabled={state.busy || !queue} onClick={() => void execute({ action: "enqueue", idempotencyKey: `manual-${Date.now()}`, kind: "MANUAL_CHECK", payload: { source: "admin-console" }, priority: 10, queueId: queue?.id })}>إضافة Job</button><button disabled={state.busy || !queue || !worker} onClick={() => void execute({ action: "lease", queueId: queue?.id, workerId: worker?.id })}>Lease التالي</button>{jobs.filter((item) => ["FAILED", "DEAD_LETTER"].includes(String(item.status))).slice(0, 1).map((item) => <button key={String(item.id)} disabled={state.busy} onClick={() => void execute({ action: "retryJob", jobId: item.id })}>إعادة Job فاشل</button>)}<button disabled={state.busy} onClick={() => void execute({ action: "recordBackup", provider: "UNASSIGNED", status: "RUNNING" })}>تسجيل بدء Backup</button>{backups.filter((item) => item.type === "BACKUP" && item.status === "SUCCEEDED").slice(0, 1).map((item) => <button key={String(item.id)} disabled={state.busy} onClick={() => void execute({ action: "recordRestoreDrill", backupId: item.id, status: "PLANNED", target: "isolated-restore-environment" })}>تخطيط Restore Drill</button>)}</div>{state.message ? <p className="admin-ops-feedback" role="status">{state.message}</p> : null}</section>;
}