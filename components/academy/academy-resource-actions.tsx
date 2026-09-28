"use client";

import { useState } from "react";

import type { Locale } from "@/types/i18n";

type EngagementStatus = "SAVED" | "REGISTERED" | "IN_PROGRESS" | "COMPLETED";

export function AcademyResourceActions({ initialProgress = 0, initialStatus, kind, locale, resourceId }: { initialProgress?: number; initialStatus?: EngagementStatus; kind: "CERTIFICATE" | "COURSE" | "LEARNING_PATH" | "RESEARCH" | "STUDY" | "WEBINAR"; locale: Locale; resourceId: string }) {
  const ar = locale === "ar";
  const [status, setStatus] = useState<EngagementStatus | undefined>(initialStatus);
  const [progress, setProgress] = useState(initialProgress);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function update(nextStatus: EngagementStatus, progressPercent?: number) {
    setBusy(true); setMessage("");
    const response = await fetch("/api/academy/engagement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resourceId, status: nextStatus, progressPercent }) });
    const payload = await response.json().catch(() => null) as { engagement?: { status: EngagementStatus; progressPercent: number }; message?: string } | null;
    if (response.ok && payload?.engagement) { setStatus(payload.engagement.status); setProgress(payload.engagement.progressPercent); setMessage(ar ? "تم حفظ نشاطك." : "Your activity was saved."); }
    else setMessage(payload?.message ?? (ar ? "تعذر حفظ النشاط." : "Activity could not be saved."));
    setBusy(false);
  }

  async function share() {
    const data = { title: document.title, text: document.title, url: window.location.href };
    if (navigator.share) await navigator.share(data).catch(() => undefined);
    else { await navigator.clipboard.writeText(window.location.href); setMessage(ar ? "تم نسخ الرابط." : "Link copied."); }
  }

  return <div className="academy-resource-actions" data-academy-engagement={status ?? "NONE"} data-academy-outputs="PRINT_PDF,SHARE_LINK">
    <div className="academy-resource-actions__commands">
      {kind === "WEBINAR" && !status ? <button className="button button--primary" disabled={busy} onClick={() => void update("REGISTERED")} type="button">{ar ? "التسجيل في الندوة" : "Register for webinar"}</button> : null}
      {(kind === "STUDY" || kind === "RESEARCH" || kind === "CERTIFICATE") && !status ? <button className="button button--secondary" disabled={busy} onClick={() => void update("SAVED")} type="button">{ar ? "حفظ في مكتبتي" : "Save to library"}</button> : null}
      {kind === "LEARNING_PATH" && status !== "COMPLETED" ? status === "IN_PROGRESS" ? <button className="button button--primary" disabled={busy} onClick={() => void update("COMPLETED", 100)} type="button">{ar ? "إكمال المسار" : "Complete path"}</button> : <button className="button button--primary" disabled={busy} onClick={() => void update("IN_PROGRESS", 1)} type="button">{ar ? "بدء المسار" : "Start path"}</button> : null}
      <button className="button button--ghost" onClick={() => window.print()} type="button">{ar ? "طباعة / PDF" : "Print / PDF"}</button>
      <button className="button button--ghost" onClick={() => void share()} type="button">{ar ? "مشاركة" : "Share"}</button>
    </div>
    {status ? <span>{status.replaceAll("_", " ")}{progress ? ` · ${progress}%` : ""}</span> : null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}