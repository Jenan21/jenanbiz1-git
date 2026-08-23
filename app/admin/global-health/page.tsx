"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type HealthSummary = {
  healthServices: Array<{ label: string; value: string; detail: string }>;
  averageIntelligence: number;
  pendingTasks: number;
};

export default function GlobalHealthPage() {
  const [summary, setSummary] = useState<HealthSummary>({
    healthServices: [],
    averageIntelligence: 0,
    pendingTasks: 0,
  });

  useEffect(() => {
    fetch("/api/admin/summary")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success && payload.summary) {
          setSummary({
            healthServices: payload.summary.healthServices,
            averageIntelligence: payload.summary.averageIntelligence,
            pendingTasks: payload.summary.pendingTasks,
          });
        }
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
            <p>راقب صحة البيئة الذكية بالكامل وتأكد أن محرك السياسة، أسطول الصائدين، وخطوط القرار تبقى مستقرة.</p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> الصحة مستقرة</span>
            <strong>{summary.averageIntelligence}%</strong>
            <small>النظم الأساسية متصلة</small>
          </div>
        </section>

        <section className="stats-grid stats-grid--admin">
          {summary.healthServices.map((item) => (
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
              <div className="mission-item"><span className="mission-icon">✓</span><span>الخدمات الأساسية تعمل دون تدهور</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>القرارات الآلية ضمن SLA المتوقع</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>مراقبة المخاطر نشطة وقائمة المراجعة منخفضة</span></div>
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>وضع الاستجابة</h2>
              <span>حالة التصعيد</span>
            </header>
            <div className="generation-grid">
              <div className="metric-pill good"><small>حرج</small><strong>0</strong></div>
              <div className="metric-pill safe"><small>تحذير</small><strong>{Math.min(9, summary.pendingTasks)}</strong></div>
              <div className="metric-pill safe"><small>معلومة</small><strong>12</strong></div>
              <div className="metric-pill good"><small>محلولة</small><strong>21</strong></div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
