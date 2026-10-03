"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type InformationRequest = { id: string; label: string; status: string };

async function sendCommand(payload: Record<string, unknown>) {
  const response = await fetch("/api/admin/operations-center", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message ?? "تعذر تنفيذ العملية");
}

export function AdminOperationActions({ path, informationRequests = [] }: { path: string; informationRequests?: InformationRequest[] }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; message: string; error: boolean }>({ busy: false, message: "", error: false });

  async function submit(event: FormEvent<HTMLFormElement>, action: "createBatch" | "createMission") {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setState({ busy: true, message: "", error: false });
    try {
      await sendCommand(action === "createMission" ? {
        action,
        name: values.get("name"),
        description: values.get("description") || undefined,
        requiredIntelligence: Number(values.get("requiredIntelligence") || 0),
      } : {
        action,
        name: values.get("name"),
        requestedCount: Number(values.get("requestedCount") || 0),
        priority: Number(values.get("priority") || 0),
      });
      form.reset();
      setState({ busy: false, message: "تم تنفيذ العملية وتسجيلها في سجل التدقيق.", error: false });
      router.refresh();
    } catch (error) {
      setState({ busy: false, message: error instanceof Error ? error.message : "تعذر تنفيذ العملية", error: true });
    }
  }

  async function review(requestId: string, status: "REVIEWED" | "CLOSED") {
    setState({ busy: true, message: "", error: false });
    try {
      await sendCommand({ action: "reviewInformationRequest", requestId, status });
      setState({ busy: false, message: "تم تحديث الطلب وتسجيل القرار.", error: false });
      router.refresh();
    } catch (error) {
      setState({ busy: false, message: error instanceof Error ? error.message : "تعذر تنفيذ العملية", error: true });
    }
  }

  if (path === "/missions/create") {
    return (
      <section className="admin-ops-command" aria-labelledby="mission-command-title">
        <div><span>عملية موثقة</span><h2 id="mission-command-title">إنشاء مهمة مسودة</h2><p>تنشأ المهمة بحالة DRAFT وتحتاج توزيعاً ومراجعة قبل التشغيل.</p></div>
        <form onSubmit={(event) => submit(event, "createMission")}>
          <label>اسم المهمة<input name="name" minLength={2} maxLength={160} required /></label>
          <label>الذكاء المطلوب<input name="requiredIntelligence" type="number" min={0} max={100} defaultValue={0} required /></label>
          <label className="admin-ops-command__wide">الوصف<textarea name="description" maxLength={4000} rows={3} /></label>
          <button className="btn primary" type="submit" disabled={state.busy}>{state.busy ? "جارٍ الإنشاء..." : "إنشاء المهمة"}</button>
        </form>
        {state.message ? <p className={state.error ? "admin-ops-feedback error" : "admin-ops-feedback"} role="status">{state.message}</p> : null}
      </section>
    );
  }

  if (path === "/robots/factory/create-batch") {
    return (
      <section className="admin-ops-command" aria-labelledby="batch-command-title">
        <div><span>عملية موثقة</span><h2 id="batch-command-title">إنشاء دفعة مرشحين</h2><p>تُنشأ الدفعة فارغة، ثم تُربط ملفات المرشحين من إدارة الأكاديمية.</p></div>
        <form onSubmit={(event) => submit(event, "createBatch")}>
          <label>اسم الدفعة<input name="name" minLength={2} maxLength={160} required /></label>
          <label>العدد المطلوب<input name="requestedCount" type="number" min={0} max={10000} defaultValue={0} required /></label>
          <label>الأولوية<input name="priority" type="number" min={0} max={100} defaultValue={0} required /></label>
          <button className="btn primary" type="submit" disabled={state.busy}>{state.busy ? "جارٍ الإنشاء..." : "إنشاء الدفعة"}</button>
        </form>
        {state.message ? <p className={state.error ? "admin-ops-feedback error" : "admin-ops-feedback"} role="status">{state.message}</p> : null}
      </section>
    );
  }

  if (path === "/robots/factory" && informationRequests.length) {
    return (
      <section className="admin-ops-command" aria-labelledby="request-command-title">
        <div><span>مراجعة بشرية</span><h2 id="request-command-title">طلبات معلومات الروبوتات</h2><p>لا يبدأ أي تنفيذ آلي من طلبات المستخدمين. راجع الطلب ثم أغلقه صراحة.</p></div>
        <div className="admin-ops-review-list">
          {informationRequests.slice(0, 8).map((request) => (
            <div key={request.id}>
              <span><strong>{request.label}</strong><small>{request.status}</small></span>
              <span>
                <button type="button" className="btn small secondary" disabled={state.busy || request.status !== "REQUESTED"} onClick={() => review(request.id, "REVIEWED")}>تمت المراجعة</button>
                <button type="button" className="btn small" disabled={state.busy || request.status === "CLOSED"} onClick={() => review(request.id, "CLOSED")}>إغلاق</button>
              </span>
            </div>
          ))}
        </div>
        {state.message ? <p className={state.error ? "admin-ops-feedback error" : "admin-ops-feedback"} role="status">{state.message}</p> : null}
      </section>
    );
  }

  return null;
}