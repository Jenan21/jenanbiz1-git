"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type ReportSummary = {
  reports: Array<{ title: string; value: string; detail: string }>;
  leaders: Array<{ name: string; score: number; reward: string }>;
  averageIntelligence: number;
  totalRobots: number;
};

export default function ReportsPage() {
  const [summary, setSummary] = useState<ReportSummary>({
    reports: [],
    leaders: [],
    averageIntelligence: 0,
    totalRobots: 0,
  });

  useEffect(() => {
    fetch("/api/admin/summary")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success && payload.summary) {
          setSummary({
            reports: payload.summary.reports,
            leaders: payload.summary.leaders,
            averageIntelligence: payload.summary.averageIntelligence,
            totalRobots: payload.summary.totalRobots,
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
            <div className="kicker">التقارير</div>
            <h1>تقارير الذكاء اليومية</h1>
            <p>
              تلخص هذه التقارير دورة 24 ساعة: توليد الصائدين، مراجعة اللجنة، الترقيات، وجودة توصيات المهام.
            </p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> تم تحديثه اليوم</span>
            <strong>{summary.averageIntelligence}%</strong>
            <small>مؤشر جودة المنظومة</small>
          </div>
        </section>

        <section className="stats-grid stats-grid--admin">
          {summary.reports.map((item) => (
            <Card key={item.title} className="stat-card">
              <span className="stat-card__icon accent-2" />
              <div>
                <p>{item.title}</p>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            </Card>
          ))}
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>تدفق النشاط خلال 24 ساعة</h2>
              <span>سجل الدورة</span>
            </header>
            <div className="timeline-list">
              {summary.leaders.length > 0 ? summary.leaders.map((item, index) => (
                <div key={item.name} className="timeline-item">
                  <span>{String(index + 1).padStart(2, "0")}:00</span>
                  <strong>{item.name} · {item.score}% · {item.reward}</strong>
                </div>
              )) : (
                <div className="timeline-item"><span>--:--</span><strong>لا توجد بيانات بعد</strong></div>
              )}
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>ملخص تنفيذي</h2>
              <span>رؤية المالك</span>
            </header>
            <div className="mission-list">
              <div className="mission-item"><span className="mission-icon">✓</span><span>المنظومة الحالية تحتوي على {summary.totalRobots} روبوت في قاعدة البيانات.</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>متوسط الذكاء الحالي هو {summary.averageIntelligence}%.</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>التقارير تستند إلى القيم الحقيقية من قاعدة البيانات.</span></div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
