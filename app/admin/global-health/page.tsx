"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type HealthSummary = {
  status: string;
  monitoringConfigured: boolean;
  activeRobots: number;
  activeTasks: number;
  pendingTasks: number;
  failedExecutions: number;
  pendingRetraining: number;
};

export default function GlobalHealthPage() {
  const [summary, setSummary] = useState<HealthSummary>({
    status: "LOADING",
    monitoringConfigured: false,
    activeRobots: 0,
    activeTasks: 0,
    pendingTasks: 0,
    failedExecutions: 0,
    pendingRetraining: 0,
  });

  useEffect(() => {
    fetch("/api/admin/global-health")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success && payload.health) setSummary(payload.health);
      })
      .catch(() => undefined);
  }, []);

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div>
            <div className="kicker">الصحة العامة</div>
            <h1>نظرة عامة على سلامة النظام</h1>
            <p>يعرض هذا القسم إشارات التشغيل المسجلة. وقت التشغيل وSLA لا يظهران قبل توصيل مصدر مراقبة معتمد.</p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> بيانات السجل</span>
            <strong>{summary.monitoringConfigured ? "مهيأ" : "—"}</strong>
            <small>{summary.monitoringConfigured ? "مصدر مراقبة متصل" : "مصدر مراقبة غير مهيأ"}</small>
          </div>
        </section>

        <section className="stats-grid stats-grid--admin">
          {[
            { label: "روبوتات نشطة", value: summary.activeRobots, detail: "من سجل الروبوتات" },
            { label: "مهام قيد التنفيذ", value: summary.activeTasks, detail: "نشطة أو قيد التنفيذ" },
            { label: "تنفيذات نموذج فاشلة", value: summary.failedExecutions, detail: "من سجل التنفيذ" },
            { label: "إعادة تدريب معلقة", value: summary.pendingRetraining, detail: "تحتاج متابعة" },
          ].map((item) => (
            <Card key={item.label} className="stat-card">
              <span className="stat-card__icon accent-1" />
              <div>
                <p>{item.label}</p>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            </Card>
          ))}
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>مصفوفة الخدمات</h2>
              <span>صحة التشغيل</span>
            </header>
            <div className="mission-list">
              <div className="mission-item"><span className="mission-icon">◎</span><span>حالة المراقبة: {summary.status}</span></div>
              <div className="mission-item"><span className="mission-icon">◎</span><span>مهام تنتظر الموافقة: {summary.pendingTasks}</span></div>
              <div className="mission-item"><span className="mission-icon">◎</span><span>لا توجد نسبة uptime أو SLA قبل ربط مزود مراقبة.</span></div>
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>وضع الاستجابة</h2>
              <span>حالة التصعيد</span>
            </header>
            <div className="generation-grid">
              <div className="metric-pill safe"><small>تنفيذات فاشلة</small><strong>{summary.failedExecutions}</strong></div>
              <div className="metric-pill safe"><small>إعادة تدريب</small><strong>{summary.pendingRetraining}</strong></div>
              <div className="metric-pill safe"><small>معلقة</small><strong>{summary.pendingTasks}</strong></div>
              <div className="metric-pill safe"><small>المراقبة</small><strong>{summary.monitoringConfigured ? "مهيأة" : "غير مهيأة"}</strong></div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
