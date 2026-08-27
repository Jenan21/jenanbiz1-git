"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type BountyLeader = {
  name: string;
  score: number;
  reward: string;
};

export default function BountyHuntersPage() {
  const [leaders, setLeaders] = useState<BountyLeader[]>([]);

  useEffect(() => {
    fetch("/api/admin/bounty")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success) {
          setLeaders(payload.bounty?.leaders ?? []);
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div>
            <div className="kicker">صائدو الجوائز</div>
            <h1>محرك المكافآت والاكتشاف</h1>
            <p>
              تتبع أقوى المساهمين وتحدد الوكلاء الذين يرفعون أعلى جودة للإشارات في الاكتشاف والتقييم وإنجاز المهام.
            </p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> نشط</span>
            <strong>{leaders.length > 0 ? leaders.length : 0}</strong>
            <small>صائد نشط</small>
          </div>
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>لوحة المتصدرين</h2>
              <span>أفضل الصائدين</span>
            </header>
            <div className="committee-list">
              {leaders.length > 0 ? leaders.map((hunter) => (
                <div key={hunter.name} className="committee-item">
                  <div>
                    <strong>{hunter.name}</strong>
                    <small>جودة الإشارة</small>
                  </div>
                  <div className="committee-score-box">
                    <span>{hunter.score}%</span>
                    <small>{hunter.reward}</small>
                  </div>
                </div>
              )) : (
                <div className="committee-item"><div><strong>لا توجد بيانات</strong><small>في انتظار التحديث</small></div></div>
              )}
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>منطق المكافآت</h2>
              <span>السياسة</span>
            </header>
            <div className="mission-list">
              <div className="mission-item"><span className="mission-icon">✓</span><span>المكافأة تعتمد على جودة الإشارة المحققة وإنجاز المهمة</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>المبالغ الأعلى محفوظة للاكتشافات الموثوقة والمنخفضة الضوضاء</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>يتم ترشيح الصائدين غير الموثوقين خارج منحنى الجوائز</span></div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
