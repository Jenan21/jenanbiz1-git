"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type ProviderReview = {
  providerLabel: string;
  status: "DRAFT" | "APPROVED" | "SUSPENDED";
  contractReference: string | null;
  operationalOwner: string | null;
  reviewedAt: string | null;
};
type ProviderState = {
  environment: { tileUrlConfigured: boolean; attributionConfigured: boolean; providerLabelConfigured: boolean };
  review: ProviderReview | null;
};

export default function MapProviderPage() {
  const [state, setState] = useState<ProviderState | null>(null);
  const [providerLabel, setProviderLabel] = useState("");
  const [status, setStatus] = useState<ProviderReview["status"]>("DRAFT");
  const [contractReference, setContractReference] = useState("");
  const [operationalOwner, setOperationalOwner] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/map-provider", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { success?: boolean; environment?: ProviderState["environment"]; review?: ProviderReview | null; message?: string } | null;
    if (!response.ok || !payload?.success || !payload.environment) {
      setMessage(payload?.message ?? "تعذر تحميل حالة مزود الخرائط.");
      return;
    }
    setState({ environment: payload.environment, review: payload.review ?? null });
    if (payload.review) {
      setProviderLabel(payload.review.providerLabel);
      setStatus(payload.review.status);
      setContractReference(payload.review.contractReference ?? "");
      setOperationalOwner(payload.review.operationalOwner ?? "");
    }
  }

  const loadOnMount = useEffectEvent(() => { void load(); });

  useEffect(() => {
    const timeout = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/map-provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerLabel, status, contractReference: contractReference || undefined, operationalOwner: operationalOwner || undefined }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; message?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? "تعذر حفظ اعتماد المزود.");
      setMessage("تم حفظ اعتماد مزود الخرائط. مفاتيح الخدمة تبقى في بيئة النشر فقط.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ اعتماد المزود.");
    } finally {
      setBusy(false);
    }
  }

  const configured = state ? Object.values(state.environment).every(Boolean) : false;
  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div><div className="kicker">تكاملات الخرائط</div><h1>حوكمة مزود الخرائط</h1><p>اعتمد المزود والمالك التشغيلي هنا. لا تُخزّن روابط البلاطات أو المفاتيح في قاعدة البيانات أو لوحة الإدارة.</p></div>
          <div className="owner-summary"><span className="pill"><span className="live-dot" /> إعدادات بيئية</span><strong>{configured ? "مكتملة" : "ناقصة"}</strong><small>{configured ? "مستعد لمزود مرخّص" : "أكمل متغيرات بيئة النشر"}</small></div>
        </section>
        <section className="stats-grid stats-grid--admin">
          {[
            ["رابط البلاطات", state?.environment.tileUrlConfigured],
            ["نسب المصدر", state?.environment.attributionConfigured],
            ["اسم المزود", state?.environment.providerLabelConfigured],
          ].map(([label, ready]) => <Card className="stat-card" key={String(label)}><span className="stat-card__icon accent-3" /><div><p>{label}</p><strong>{ready ? "مهيأ" : "غير مهيأ"}</strong><small>حالة البيئة فقط</small></div></Card>)}
        </section>
        <section className="owner-grid"><Card className="owner-panel"><header className="panel-header"><h2>اعتماد المزود</h2><span>سجل تدقيقي</span></header><form className="admin-map-provider-form" onSubmit={save}><label>اسم المزود<input required minLength={2} maxLength={160} value={providerLabel} onChange={(event) => setProviderLabel(event.target.value)} placeholder="مثال: MapTiler Enterprise" /></label><label>حالة الاعتماد<select value={status} onChange={(event) => setStatus(event.target.value as ProviderReview["status"])}><option value="DRAFT">مسودة</option><option value="APPROVED">معتمد</option><option value="SUSPENDED">معلق</option></select></label><label>مرجع العقد أو التذكرة<input maxLength={500} value={contractReference} onChange={(event) => setContractReference(event.target.value)} /></label><label>المالك التشغيلي<input maxLength={160} value={operationalOwner} onChange={(event) => setOperationalOwner(event.target.value)} /></label><button className="btn primary" disabled={busy} type="submit">{busy ? "جارٍ الحفظ..." : "حفظ الاعتماد"}</button></form>{message ? <p className="empty-state" role="status">{message}</p> : null}</Card><Card className="owner-panel"><header className="panel-header"><h2>خطوة النشر</h2><span>خارج قاعدة البيانات</span></header><div className="mission-list"><div className="mission-item"><span className="mission-icon">1</span><span>اشترِ أو اعتمد مزود بلاطات مرخّصاً وفق حجم الاستخدام.</span></div><div className="mission-item"><span className="mission-icon">2</span><span>أضف رابط البلاطات والنسب والاسم في أسرار بيئة النشر: <code>NEXT_PUBLIC_MAP_TILE_URL</code> و<code>NEXT_PUBLIC_MAP_ATTRIBUTION</code> و<code>NEXT_PUBLIC_MAP_PROVIDER_LABEL</code>.</span></div><div className="mission-item"><span className="mission-icon">3</span><span>أعد نشر التطبيق، ثم تحقق من أن حالة البيئة أعلاه أصبحت مكتملة.</span></div></div></Card></section>
      </main>
    </AdminShell>
  );
}