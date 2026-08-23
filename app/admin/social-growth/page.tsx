"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type GrowthSummary = {
  growthChannels: Array<{ label: string; value: string; detail: string }>;
  averageSkill: number;
};

export default function SocialGrowthPage() {
  const [summary, setSummary] = useState<GrowthSummary>({
    growthChannels: [],
    averageSkill: 0,
  });

  useEffect(() => {
    fetch("/api/admin/summary")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success && payload.summary) {
          setSummary({
            growthChannels: payload.summary.growthChannels,
            averageSkill: payload.summary.averageSkill,
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
            <div className="kicker">النمو الاجتماعي</div>
            <h1>محرك الجمهور والمجتمع</h1>
            <p>راقب كيف توسّع المنصة نطاقها الخارجي وتحسن المشاركة وتحدد أفضل القنوات للدورة التالية من النمو.</p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> ينمو</span>
            <strong>{summary.averageSkill}%</strong>
            <small>تفاعلات جديدة / يوم</small>
          </div>
        </section>

        <section className="stats-grid stats-grid--admin">
          {summary.growthChannels.map((item) => (
            <Card key={item.label} className="stat-card">
              <span className="stat-card__icon accent-2" />
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
              <h2>أفضل القنوات</h2>
              <span>محركات النمو</span>
            </header>
            <div className="mission-list">
              <div className="mission-item"><span className="mission-icon">✓</span><span>حلقة المحتوى المرتبط تنتج أقوى مكسب إحالة</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>التسويق المختصر يبقى أفضل مصدر لصدمات المشاركة</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>حملات الشراكات تبقى فعالة وقابلة للتوسع</span></div>
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>تركيز النمو</h2>
              <span>إجراء الدورة القادمة</span>
            </header>
            <div className="team-summary">
              <div className="team-row"><div><strong>المحتوى القصير</strong><small>+21%</small></div><b>عالي</b></div>
              <div className="team-row"><div><strong>الشراكات</strong><small>+16%</small></div><b>عالي</b></div>
              <div className="team-row"><div><strong>حلقات الاحتفاظ</strong><small>+11%</small></div><b>متوسط</b></div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
