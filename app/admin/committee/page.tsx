"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type CommitteeItem = {
  id: string;
  robotName: string;
  reviewer: string;
  score: number;
  verdict: "APPROVE" | "DEFER" | "REJECT";
  notes?: string;
};

export default function CommitteePage() {
  const [committee, setCommittee] = useState<CommitteeItem[]>([]);

  useEffect(() => {
    let active = true;

    fetch("/api/admin/committee")
      .then((response) => response.json())
      .then((payload) => {
        if (!active || !payload?.success || !Array.isArray(payload.reviews)) return;
        setCommittee(payload.reviews);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const averageScore = committee.length
    ? Math.round(committee.reduce((sum, item) => sum + item.score, 0) / committee.length)
    : 0;

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div>
            <div className="kicker">تقرير اللجنة</div>
            <h1>مراجعة لجنة 50</h1>
            <p>
              تراجع اللجنة أعلى الصائدين قدرة وتقرر ما إذا كان ينبغي إبقاؤهم_visible في واجهة المالك أو نقلهم إلى قائمة المراقبة.
            </p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> {committee.length} عضو</span>
            <strong>{averageScore}%</strong>
            <small>متوسط الموافقة</small>
          </div>
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>بطاقة تقييم اللجنة</h2>
              <span>أعلى المقيمين</span>
            </header>
            <div className="committee-list">
              {committee.length === 0 && <p className="placeholder-value">لا توجد مراجعات لجنة محفوظة حالياً.</p>}
              {committee.map((member) => (
                <div key={member.id} className="committee-item">
                  <div>
                    <strong>{member.robotName}</strong>
                    <small>{member.reviewer}</small>
                  </div>
                  <div className="committee-score-box">
                    <span>{member.score}%</span>
                    <small>{member.notes ?? "تقييم"}</small>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>توجيه اللجنة</h2>
              <span>سياسة المالك</span>
            </header>
            <div className="mission-list">
              <div className="mission-item">
                <span className="mission-icon">✓</span>
                <span>اعتمد فقط الصائدين ذوي الذكاء المستقر والتقييمات الموثوقة.</span>
              </div>
              <div className="mission-item">
                <span className="mission-icon">✓</span>
                <span>راجع طبقة المراقبة قبل إسناد المهام عالية الخطورة.</span>
              </div>
              <div className="mission-item">
                <span className="mission-icon">✓</span>
                <span>احتفظ بالمنفذين الضعفاء بعيداً عن واجهة المالك المباشرة.</span>
              </div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
