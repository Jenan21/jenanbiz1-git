"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Row = Record<string, string | number | boolean | null>;

export function KnowledgeActions({ entries }: { entries: Row[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(String(entries[0]?.id ?? ""));
  const selected = entries.find((item) => String(item.id) === selectedId) ?? null;
  const [state, setState] = useState({ busy: false, error: false, message: "" });

  async function execute(payload: Record<string, unknown>) {
    setState({ busy: true, error: false, message: "" });
    try {
      const response = await fetch("/api/admin/intelligence-knowledge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message ?? "تعذر تنفيذ أمر المعرفة");
      if (payload.action === "create") setSelectedId(String(body.result.id));
      setState({ busy: false, error: false, message: "تم حفظ العملية في سجل المعرفة والتدقيق." });
      router.refresh();
    } catch (error) {
      setState({ busy: false, error: true, message: error instanceof Error ? error.message : "تعذر تنفيذ الأمر" });
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void execute({ action: selected ? "createVersion" : "create", changeSummary: selected ? String(values.get("changeSummary") || "Updated verified knowledge") : undefined, confidence: Number(values.get("confidence") || 0), content: values.get("content"), knowledgeId: selected?.id, source: values.get("source"), sourcePublishedAt: new Date(String(values.get("sourcePublishedAt"))).toISOString(), sourceUrl: values.get("sourceUrl") || undefined, title: values.get("title") });
  }

  return (
    <section className="mission-engine-console" aria-labelledby="knowledge-console-title">
      <header><div><span>INTELLIGENCE GOVERNANCE</span><h2 id="knowledge-console-title">إصدارات المعرفة واعتمادها</h2></div>{selected ? <strong>v{String(selected.currentVersion)} · {String(selected.approvalState)}</strong> : <strong>NEW ENTRY</strong>}</header>
      <div className="mission-engine-console__selectors"><label>السجل<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">معرفة جديدة</option>{entries.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.title)} · v{String(item.currentVersion)}</option>)}</select></label></div>
      <form className="admin-ops-command" onSubmit={create}><label>العنوان<input name="title" defaultValue={selected ? String(selected.title) : ""} minLength={2} required /></label><label>الثقة<input name="confidence" defaultValue={selected ? Number(selected.confidence) : 70} min={0} max={100} type="number" required /></label><label>المصدر<input name="source" defaultValue={selected ? String(selected.source) : ""} minLength={2} required /></label><label>تاريخ المصدر<input name="sourcePublishedAt" type="date" defaultValue={selected?.sourceDate ? String(selected.sourceDate).slice(0, 10) : ""} required /></label><label>رابط المصدر<input name="sourceUrl" type="url" /></label>{selected ? <label>ملخص التغيير<input name="changeSummary" minLength={2} required /></label> : null}<label className="admin-ops-command__wide">المحتوى<textarea name="content" minLength={2} required rows={4} /></label><button className="btn primary" disabled={state.busy} type="submit">{selected ? "إنشاء إصدار" : "إنشاء معرفة"}</button></form>
      {selected ? <div className="mission-engine-console__commands"><button disabled={state.busy} onClick={() => void execute({ action: "review", knowledgeId: selected.id, notes: "Submitted for human review", state: "IN_REVIEW" })}>إرسال للمراجعة</button><button disabled={state.busy || selected.approvalState !== "IN_REVIEW"} onClick={() => void execute({ action: "review", knowledgeId: selected.id, notes: "Source and evidence reviewed", state: "APPROVED" })}>اعتماد</button><button disabled={state.busy || Number(selected.currentVersion) <= 1} onClick={() => void execute({ action: "rollback", knowledgeId: selected.id, reason: "Administrative rollback to verified baseline", targetVersion: 1 })}>Rollback إلى v1</button></div> : null}
      {state.message ? <p className={state.error ? "admin-ops-feedback error" : "admin-ops-feedback"} role="status">{state.message}</p> : null}
    </section>
  );
}