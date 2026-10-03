"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type Observation = {
  title: string;
  summary: string;
  action: string;
  source: "PERSISTED_RECORDS";
};

export default function IntelligencePage() {
  const [observations, setObservations] = useState<Observation[]>([]);

  useEffect(() => {
    fetch("/api/admin/intel")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success && Array.isArray(payload.observations)) {
          setObservations(payload.observations);
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
            <h1>مؤشرات المنصة التشغيلية</h1>
            <p>يعرض هذا المركز ملاحظات قابلة للتحقق من سجلات المنصة. لا يعرض توصيات نموذج أو نسبة ثقة قبل تنفيذ تحليل حقيقي ومسجل.</p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> سجلية</span>
            <strong>{observations.length}</strong>
            <small>ملاحظات تشغيلية</small>
          </div>
        </section>

        <section className="owner-grid">
          {observations.map((item) => (
            <Card key={item.title} className="owner-panel">
              <header className="panel-header">
                <h2>{item.title}</h2>
                <span>سجل المنصة</span>
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
