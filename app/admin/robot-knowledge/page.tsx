"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

type KnowledgeSummary = {
  knowledgeLayers: Array<{ label: string; value: string; detail: string }>;
  skillChart: Array<{ name: string; score: number }>;
  averageIntelligence: number;
  hiddenRobots: number;
};

export default function RobotKnowledgePage() {
  const [summary, setSummary] = useState<KnowledgeSummary>({
    knowledgeLayers: [],
    skillChart: [],
    averageIntelligence: 0,
    hiddenRobots: 0,
  });

  useEffect(() => {
    fetch("/api/admin/summary")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success && payload.summary) {
          setSummary({
            knowledgeLayers: payload.summary.knowledgeLayers,
            skillChart: payload.summary.skillChart,
            averageIntelligence: payload.summary.averageIntelligence,
            hiddenRobots: payload.summary.hiddenRobots,
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
            <div className="kicker">ذاكرة المنصة</div>
            <h1>مركز معرفة الصائدين</h1>
            <p>
              يضيف كل صائد مهارات جديدة وجودة تقارير ونماذج تعلم إلى قلب ذكاء مشترك. الأقوى يبقى والأضعف يُمرَّر إلى المرشح، وأقوى المعرفة تنتقل إلى الجيل التالي.
            </p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> حلقة تعلم نشطة</span>
            <strong>{summary.averageIntelligence}%</strong>
            <small>تراكم مستمر</small>
          </div>
        </section>

        <section className="stats-grid stats-grid--admin">
          {summary.knowledgeLayers.map((layer) => (
            <Card className="stat-card" key={layer.label}>
              <span className="stat-card__icon accent-2">
                <Icon name="brain" />
              </span>
              <div>
                <p>{layer.label}</p>
                <strong>{layer.value}</strong>
                <small>{layer.detail}</small>
              </div>
            </Card>
          ))}
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>رسم وراثة المهارات</h2>
              <span>حصن المعرفة</span>
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
              <h2>قواعد المعرفة</h2>
              <span>سياسة المنظومة</span>
            </header>
            <div className="mission-list">
              <div className="mission-item">
                <span className="mission-icon"><Icon name="check" /></span>
                <span>يتم التخلص تلقائياً من {summary.hiddenRobots} صائد ضعيف في قاعدة البيانات.</span>
              </div>
              <div className="mission-item">
                <span className="mission-icon"><Icon name="check" /></span>
                <span>ينقل الأقوى مهاراته المثبتة إلى الجيل التالي</span>
              </div>
              <div className="mission-item">
                <span className="mission-icon"><Icon name="check" /></span>
                <span>يبقى موافقة المشرف والمدير إلزامية</span>
              </div>
              <div className="mission-item">
                <span className="mission-icon"><Icon name="check" /></span>
                <span>تبقى أنشطة الصائد الخارجي مخفية وتقع تحت المراقبة</span>
              </div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
