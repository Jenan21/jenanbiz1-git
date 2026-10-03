"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Row = Record<string, string | number | boolean | null>;

async function command(payload: Record<string, unknown>) {
  const response = await fetch("/api/admin/mission-engine", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message ?? "تعذر تنفيذ أمر المهمة");
  return body.result as Row;
}

export function MissionEngineActions({ approvals, missions, robots, runs, subtasks }: { approvals: Row[]; missions: Row[]; robots: Row[]; runs: Row[]; subtasks: Row[] }) {
  const router = useRouter();
  const [selectedMission, setSelectedMission] = useState(String(missions[0]?.id ?? ""));
  const missionRuns = runs.filter((item) => String(item.missionId) === selectedMission);
  const [selectedRun, setSelectedRun] = useState(String(missionRuns[0]?.id ?? runs[0]?.id ?? ""));
  const [state, setState] = useState({ busy: false, error: false, message: "" });
  const run = runs.find((item) => String(item.id) === selectedRun) ?? missionRuns[0] ?? null;
  const runSubtasks = subtasks.filter((item) => item.type === "SUBTASK" && item.traceId === run?.traceId);
  const pendingApproval = approvals.find((item) => item.type === "APPROVAL" && item.traceId === run?.traceId && ["PENDING", "ESCALATED"].includes(String(item.status)));

  async function execute(payload: Record<string, unknown>) {
    setState({ busy: true, error: false, message: "" });
    try {
      const result = await command(payload);
      if (payload.action === "createRun") setSelectedRun(String(result.id));
      setState({ busy: false, error: false, message: "تم تنفيذ الأمر وتسجيله في سجل المهمة." });
      router.refresh();
    } catch (error) {
      setState({ busy: false, error: true, message: error instanceof Error ? error.message : "تعذر تنفيذ الأمر" });
    }
  }

  function submitSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void execute({ action: "addSubtask", key: values.get("key"), runId: run?.id, sequence: Number(values.get("sequence") || 0), title: values.get("title") });
  }

  return (
    <section className="mission-engine-console" aria-labelledby="mission-engine-title">
      <header><div><span>MISSION ENGINE</span><h2 id="mission-engine-title">دورة التشغيل الدائمة</h2></div>{run ? <strong>{String(run.status)} · {String(run.traceId)}</strong> : <strong>NO RUN</strong>}</header>
      <div className="mission-engine-console__selectors">
        <label>المهمة<select value={selectedMission} onChange={(event) => { setSelectedMission(event.target.value); const next = runs.find((item) => String(item.missionId) === event.target.value); setSelectedRun(String(next?.id ?? "")); }}>{missions.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label>
        <label>التشغيل<select value={selectedRun} onChange={(event) => setSelectedRun(event.target.value)}><option value="">تشغيل جديد</option>{missionRuns.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.traceId)} · {String(item.status)}</option>)}</select></label>
        <button className="btn primary" disabled={state.busy || !selectedMission} onClick={() => void execute({ action: "createRun", missionId: selectedMission })} type="button">إنشاء Run</button>
      </div>
      {run ? <div className="mission-engine-console__commands">
        {run.status === "CREATED" ? <><form onSubmit={submitSubtask}><input name="key" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="subtask-key" required /><input name="title" minLength={2} placeholder="عنوان المهمة الفرعية" required /><input name="sequence" type="number" min={0} defaultValue={runSubtasks.length + 1} /><button disabled={state.busy} type="submit">إضافة Subtask</button></form><button disabled={state.busy} onClick={() => void execute({ action: "configureRetry", backoff: "EXPONENTIAL", baseDelaySeconds: 30, maximumDelaySeconds: 3600, maxAttempts: 3, missionId: selectedMission, retryableErrors: ["TIMEOUT", "PROVIDER_UNAVAILABLE"] })}>ضبط Retry</button><button disabled={state.busy} onClick={() => void execute({ action: "addFallback", missionId: selectedMission, name: `Fallback ${Date.now()}`, priority: 1, provider: "UNASSIGNED" })}>إضافة Fallback</button><button disabled={state.busy} onClick={() => void execute({ action: "queueRun", runId: run.id })}>إرسال للطابور</button></> : null}
        {run.status === "CREATED" && runSubtasks.length > 1 ? <form onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void execute({ action: "addDependency", predecessorId: values.get("predecessorId"), runId: run.id, successorId: values.get("successorId"), type: "REQUIRES" }); }}><select name="predecessorId">{runSubtasks.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.title)}</option>)}</select><select name="successorId">{runSubtasks.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.title)}</option>)}</select><button disabled={state.busy} type="submit">إضافة اعتماد</button></form> : null}
        {["QUEUED", "RETRY", "FALLBACK"].includes(String(run.status)) ? <button disabled={state.busy} onClick={() => void execute({ action: "startRun", runId: run.id })}>بدء المحاولة</button> : null}
        {run.status === "RUNNING" ? <><button disabled={state.busy} onClick={() => void execute({ action: "requestApproval", gate: "FINAL_OUTPUT", runId: run.id })}>طلب موافقة</button><button disabled={state.busy} onClick={() => void execute({ action: "failAttempt", error: "MANUAL_FAILURE", runId: run.id })}>فشل المحاولة</button><form onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void execute({ action: "recordCost", computeCostMinor: Number(values.get("cost") || 0), currency: "USD", provider: "INTERNAL", runId: run.id }); }}><input name="cost" min={0} type="number" placeholder="التكلفة الصغرى" /><button disabled={state.busy} type="submit">تسجيل تكلفة</button></form>{robots[0] ? <button disabled={state.busy} onClick={() => void execute({ action: "recordEvidence", description: "Manual verified mission evidence", robotId: robots[0].id, runId: run.id, type: "MANUAL_REVIEW", verified: true })}>تسجيل دليل موثق</button> : null}<button disabled={state.busy || Number(run.evidence) < 1} title={Number(run.evidence) < 1 ? "سجل دليلاً موثقاً أولاً" : undefined} onClick={() => void execute({ action: "completeRun", output: { state: "completed_by_admin" }, runId: run.id })}>إكمال المهمة</button></> : null}
        {run.status === "WAITING_APPROVAL" && pendingApproval ? <><button disabled={state.busy} onClick={() => void execute({ action: "decideApproval", approvalId: pendingApproval.id, approve: true, rationale: "Approved in mission command center" })}>اعتماد</button><button disabled={state.busy} onClick={() => void execute({ action: "escalate", approvalId: pendingApproval.id, assignedRole: "SUPER_ADMIN", reason: "Escalated from mission command center", runId: run.id })}>تصعيد</button><button disabled={state.busy} onClick={() => void execute({ action: "decideApproval", approvalId: pendingApproval.id, approve: false, rationale: "Rejected in mission command center" })}>رفض</button></> : null}
      </div> : null}
      {state.message ? <p className={state.error ? "admin-ops-feedback error" : "admin-ops-feedback"} role="status">{state.message}</p> : null}
    </section>
  );
}