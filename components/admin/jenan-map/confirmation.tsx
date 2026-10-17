"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type MapConfirmation = {
  title: string;
  description: string;
  versionId?: string;
  action: string;
  values?: Record<string, unknown>;
  requireReason?: boolean;
};

export function MapActionConfirmation({ pending, busy, revision, publishedReleaseId, onCancel, onConfirm }: {
  pending: MapConfirmation;
  busy: boolean;
  revision: number;
  publishedReleaseId: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [accepted, setAccepted] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return <dialog className="jenan-map-admin__dialog" ref={dialog} aria-labelledby="map-confirm-title" aria-describedby="map-confirm-description" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="map-confirm-title">{pending.title}</h2>
    <p id="map-confirm-description">{pending.description}</p>
    {pending.versionId ? <p>الإصدار المستهدف: <code>{pending.versionId}</code></p> : null}
    <p>مؤشر الإنتاج المتوقع: <code>{publishedReleaseId ?? "لا يوجد"}</code><br />مراجعة الحالة المتوقعة: <bdi>{revision}</bdi></p>
    <p>يتحقق الخادم من صلاحياتك ومن مراجعة الحالة ومؤشر الإنتاج الحالي قبل التنفيذ. لا يُعاد إرسال الإجراء تلقائياً عند التعارض.</p>
    {pending.requireReason !== false ? <label>سبب الإجراء (8 أحرف على الأقل)<textarea value={reason} minLength={8} maxLength={2000} onChange={(event) => setReason(event.target.value)} disabled={busy} /></label> : null}
    <label className="jenan-map-admin__check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={busy} />أؤكد مراجعة أثر هذا الإجراء.</label>
    <div className="jenan-map-admin__actions">
      <Button type="button" onClick={() => onConfirm(reason.trim())} disabled={busy || !accepted || (pending.requireReason !== false && reason.trim().length < 8)}>{busy ? "جارٍ التنفيذ…" : "تأكيد الإجراء"}</Button>
      <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>إلغاء</Button>
    </div>
  </dialog>;
}
