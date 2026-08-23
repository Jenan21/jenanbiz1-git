"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type BranchRecord = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  activeMembers: number;
  subscriptionCount: number;
  createdAt: string;
};

export default function BranchesPage() {
  const [branches, setBranches] = useState<BranchRecord[]>([]);

  useEffect(() => {
    fetch("/api/admin/branches")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success) {
          setBranches(payload.branches ?? []);
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div>
            <div className="kicker">الفروع</div>
            <h1>هيكل المنظمات والفروع</h1>
            <p>يتم سحب أقسام المنصة والفروع مباشرة من قاعدة البيانات، مع توضيح عدد الأعضاء والاشتراكات والرفاهية التشغيلية لكل فرع.</p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> مباشر</span>
            <strong>{branches.length}</strong>
            <small>فرع/منظمة</small>
          </div>
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>قائمة الفروع</h2>
              <span>من قاعدة البيانات</span>
            </header>
            <div className="committee-list">
              {branches.length > 0 ? branches.map((branch) => (
                <div key={branch.id} className="committee-item">
                  <div>
                    <strong>{branch.name}</strong>
                    <small>{branch.slug}</small>
                  </div>
                  <div className="committee-score-box">
                    <span>{branch.activeMembers}</span>
                    <small>{branch.memberCount} عضو</small>
                  </div>
                </div>
              )) : (
                <div className="committee-item"><div><strong>لا توجد فروع</strong><small>لم يتم إنشاء بيانات بعد</small></div></div>
              )}
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>ملخص الفروع</h2>
              <span>حالة التشغيل</span>
            </header>
            <div className="mission-list">
              <div className="mission-item"><span className="mission-icon">✓</span><span>كل فرع مستمد مباشرة من جدول المنظمات.</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>عدد المستخدمين يقيس حجم النشاط في كل فرع.</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>عدد الاشتراكات يعكس حالة العضوية والخدمة.</span></div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
