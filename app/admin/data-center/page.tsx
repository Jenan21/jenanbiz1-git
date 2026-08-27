"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type DataCenterSummary = {
  knowledgeLayers: Array<{ label: string; value: string; detail: string }>;
  skillChart: Array<{ name: string; score: number }>;
  averageSkill: number;
};

export default function DataCenterPage() {
  const [summary, setSummary] = useState<DataCenterSummary>({
    knowledgeLayers: [],
    skillChart: [],
    averageSkill: 0,
  });

  useEffect(() => {
    fetch("/api/admin/summary")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success && payload.summary) {
          setSummary({
            knowledgeLayers: payload.summary.knowledgeLayers,
            skillChart: payload.summary.skillChart,
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
            <div className="kicker">مركز البيانات</div>
            <h1>قلب المعرفة والأنظمة</h1>
            <p>يحفظ محرك الذكاء مهارات الصائدين وتاريخ المقاييس وتدفقات الإشارات الفورية في طبقة تشغيل واحدة.</p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> مزامنة مباشرة</span>
            <strong>{summary.averageSkill}%</strong>
            <small>سلامة النظام</small>
          </div>
        </section>

        <section className="stats-grid stats-grid--admin">
          {summary.knowledgeLayers.map((item) => (
            <Card key={item.label} className="stat-card">
              <span className="stat-card__icon accent-3" />
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
              <h2>حالة النظام</h2>
              <span>الإشارات والمصادر</span>
            </header>
            <div className="skill-cluster-list">
              {summary.skillChart.map((skill) => (
                <div key={skill.name} className="skill-cluster">
                  <span>{skill.name}</span>
                  <div className="progress"><i style={{ width: `${skill.score}%` }} /></div>
                  <b>{skill.score}%</b>
                </div>
              ))}
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>الأولويات التشغيلية</h2>
              <span>سياسة المالك</span>
            </header>
            <div className="team-summary">
              <div className="team-row"><div><strong>اختبار جودة البيانات</strong><small>+18%</small></div><b>{Math.min(99, summary.averageSkill + 5)}%</b></div>
              <div className="team-row"><div><strong>ثقة السلسلة</strong><small>+11%</small></div><b>{Math.min(99, summary.averageSkill + 9)}%</b></div>
              <div className="team-row"><div><strong>كفاءة التخزين</strong><small>+9%</small></div><b>{Math.min(99, summary.averageSkill + 2)}%</b></div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
