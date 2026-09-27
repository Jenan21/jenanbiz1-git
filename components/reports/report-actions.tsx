"use client";

import { useState } from "react";

export function ReportActions({ canEmail, canPrint, title }: { canEmail: boolean; canPrint: boolean; title: string }) {
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

  return (
    <div className="report-actions" aria-label="إجراءات التقرير">
      <button type="button" onClick={() => window.print()} disabled={!canPrint}>طباعة / PDF</button>
      <button type="button" onClick={() => void share()}>مشاركة</button>
      <button type="button" disabled={!canEmail} title={canEmail ? undefined : "بانتظار مزود بريد معتمد"}>إرسال بالبريد</button>
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}