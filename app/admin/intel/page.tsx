"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type Insight = {
  title: string;
  summary: string;
  confidence: number;
  action: string;
};

export default function IntelligencePage() {
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    fetch("/api/admin/intel")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success && Array.isArray(payload.insights)) {
          setInsights(payload.insights);
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div>
            <div className="kicker">مركز الذكاء</div>
            <h1>ذكاء المنصة الحي</h1>
            <p>يستند هذا المركز إلى بيانات المنصة الفعلية، ويولد توصيات ذكية حول قوة الروبوتات، مراجعات اللجنة، وثقة العمليات.</p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> حية</span>
            <strong>{insights.length}</strong>
            <small>توصيات ذكية</small>
          </div>
        </section>

        <section className="owner-grid">
          {insights.map((item) => (
            <Card key={item.title} className="owner-panel">
              <header className="panel-header">
                <h2>{item.title}</h2>
                <span>ثقة {item.confidence}%</span>
              </header>
              <div className="mission-list">
                <div className="mission-item">
                  <span className="mission-icon">✓</span>
                  <span>{item.summary}</span>
                </div>
                <div className="mission-item">
                  <span className="mission-icon">◎</span>
                  <span>{item.action}</span>
                </div>
              </div>
            </Card>
          ))}
        </section>
      </main>
    </AdminShell>
  );
}
