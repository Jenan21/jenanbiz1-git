"use client";

import { useState } from "react";

export function ReportActions({ canEmail, canPrint, projectId, recipient, reportPath, title }: { canEmail: boolean; canPrint: boolean; projectId?: string; recipient: string; reportPath: string; title: string }) {
  const [message, setMessage] = useState("");

  async function share() {
    const data = { title, text: title, url: window.location.href };
    if (navigator.share) {
      await navigator.share(data).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(window.location.href);
    setMessage("تم نسخ رابط التقرير.");
  }

  async function email() {
    const response = await fetch("/api/reports/delivery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, recipient, reportPath, subject: title }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setMessage(body?.message ?? "تعذر إنشاء طلب البريد"); return; }
    setMessage(body.delivery.status === "PENDING_PROVIDER" ? "حُفظ طلب البريد: بانتظار مزود معتمد." : "تم إرسال التقرير.");
  }

  return (
    <div className="report-actions" aria-label="إجراءات التقرير">
      <button type="button" onClick={() => window.print()} disabled={!canPrint}>طباعة / PDF</button>
      <button type="button" onClick={() => void share()}>مشاركة</button>
      <button type="button" disabled={!canEmail} onClick={() => void email()} title={canEmail ? "يحفظ طلب التسليم ويعرض حالة المزود" : "يتطلب التقرير مصدراً فعلياً"}>إرسال بالبريد</button>
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}