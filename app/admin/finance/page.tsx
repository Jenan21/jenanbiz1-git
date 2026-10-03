"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type Summary = {
  revenueByCurrency: Array<{ currency: string; succeededMinor: number; pendingMinor: number; refundedMinor: number }>;
  costsByCurrency: Array<{ currency: string; provider: string; recordedMinor: number; records: number }>;
  execution: { total: number; successful: number; failed: number; successRate: number };
  dataQuality: { costRecords: number; zeroCostRecords: number; unpricedCostRate: number };
};

export default function FinancePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/finance", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("finance request failed");
        return (await response.json()) as { summary: Summary };
      })
      .then((payload) => setSummary(payload.summary))
      .catch(() => setError(true));
  }, []);

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div><div className="kicker">المالية والتكاليف</div><h1>مرآة تشغيل المنصة</h1><p>عرض موحد للإيرادات والتكاليف المسجلة وحالة تسعير الأدوات الخارجية.</p></div>
          <div className="owner-summary"><span className="pill"><span className="live-dot" /> بيانات فعلية</span><strong>{summary?.execution.successRate ?? 0}%</strong><small>نجاح التنفيذ</small></div>
        </section>
        {error && <div className="notice" role="alert">تعذر تحميل البيانات المالية.</div>}
        {!summary && !error && <div className="card empty-state" role="status">جارٍ تحميل البيانات المالية...</div>}
        {summary && <>
          <section className="stats-grid stats-grid--admin">
            <Card className="stat-card"><div><p>الإيرادات المحصلة</p><strong>{summary.revenueByCurrency.reduce((sum, item) => sum + item.succeededMinor, 0).toLocaleString()}</strong><small>بوحدة minor حسب العملة</small></div></Card>
            <Card className="stat-card"><div><p>المدفوعات المعلقة</p><strong>{summary.revenueByCurrency.reduce((sum, item) => sum + item.pendingMinor, 0).toLocaleString()}</strong><small>تحتاج متابعة مزود الدفع</small></div></Card>
            <Card className="stat-card"><div><p>عمليات ناجحة</p><strong>{summary.execution.successful}</strong><small>من {summary.execution.total}</small></div></Card>
            <Card className="stat-card"><div><p>عمليات فاشلة</p><strong>{summary.execution.failed}</strong><small>تحتاج مراجعة</small></div></Card>
          </section>
          <section className="owner-grid">
            <Card className="owner-panel"><header className="panel-header"><h2>تكاليف المزودين</h2><span>الأرقام المسجلة فقط</span></header><div className="team-summary">{summary.costsByCurrency.map((item) => <div className="team-row" key={`${item.currency}-${item.provider}`}><div><strong>{item.provider}</strong><small>{item.currency} · {item.records} سجلاً</small></div><b>{item.recordedMinor.toLocaleString()}</b></div>)}{!summary.costsByCurrency.length && <p className="empty-state">لا توجد تكاليف مسجلة.</p>}</div></Card>
            <Card className="owner-panel"><header className="panel-header"><h2>جودة بيانات التكلفة</h2><span>قبل احتساب الصافي</span></header><div className="team-summary"><div className="team-row"><div><strong>السجلات المسعرة</strong><small>{summary.dataQuality.costRecords - summary.dataQuality.zeroCostRecords}</small></div><b>{100 - summary.dataQuality.unpricedCostRate}%</b></div><div className="team-row"><div><strong>سجلات بلا سعر</strong><small>لا تُعامل كتكلفة صفرية</small></div><b>{summary.dataQuality.zeroCostRecords}</b></div></div></Card>
          </section>
        </>}
      </main>
    </AdminShell>
  );
}
