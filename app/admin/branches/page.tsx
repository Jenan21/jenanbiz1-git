"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

type BranchRecord = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  activeMembers: number;
  subscriptionCount: number;
  createdAt: string;
};

function BranchSkeleton() {
  return (
    <div className="committee-item" aria-hidden="true">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="skeleton" style={{ height: 14, width: "60%" }} />
        <div className="skeleton" style={{ height: 10, width: "35%" }} />
      </div>
      <div className="skeleton" style={{ width: 48, height: 36, borderRadius: 10 }} />
    </div>
  );
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  function loadBranches() {
    setIsLoading(true);
    setError(false);
    fetch("/api/admin/branches")
      .then((r) => r.json())
      .then((payload) => {
        if (payload?.success) {
          setBranches(payload.branches ?? []);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadBranches();
  }, []);

  const totalMembers = branches.reduce((s, b) => s + b.memberCount, 0);
  const totalActive = branches.reduce((s, b) => s + b.activeMembers, 0);
  const totalSubs = branches.reduce((s, b) => s + b.subscriptionCount, 0);

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div>
            <div className="kicker">الفروع</div>
            <h1>هيكل المنظمات والفروع</h1>
            <p>
              يتم سحب أقسام المنصة والفروع مباشرة من قاعدة البيانات، مع توضيح
              عدد الأعضاء والاشتراكات والحالة التشغيلية لكل فرع.
            </p>
          </div>
          <div className="owner-summary">
            <span className="pill">
              <span className="live-dot" />
              مباشر
            </span>
            <strong>{isLoading ? "—" : branches.length}</strong>
            <small>فرع/منظمة</small>
          </div>
        </section>

        {/* Summary metrics */}
        <section className="kpi-grid" style={{ marginBottom: 18 }}>
          {[
            { label: "إجمالي الأعضاء", value: isLoading ? "—" : totalMembers, icon: "people" as const },
            { label: "الأعضاء النشطون", value: isLoading ? "—" : totalActive, icon: "activity" as const },
            { label: "الاشتراكات", value: isLoading ? "—" : totalSubs, icon: "wallet" as const },
            { label: "الفروع", value: isLoading ? "—" : branches.length, icon: "grid" as const },
          ].map((m) => (
            <Card key={m.label} className="metric-card">
              <span className="metric-icon">
                <Icon name={m.icon} />
              </span>
              <div>
                <p className="metric-label">{m.label}</p>
                <strong className="metric-value">
                  {isLoading ? (
                    <span className="skeleton" style={{ display: "inline-block", width: 40, height: 24, borderRadius: 6 }} />
                  ) : (
                    m.value
                  )}
                </strong>
              </div>
            </Card>
          ))}
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>قائمة الفروع</h2>
              <span className="count-badge">{isLoading ? "…" : branches.length}</span>
            </header>
            <div className="committee-list">
              {isLoading && Array.from({ length: 4 }).map((_, i) => (
                <BranchSkeleton key={`skeleton-${i}`} />
              ))}
              {!isLoading && error && (
                <div className="error-state-card" style={{ margin: "8px 0" }}>
                  <span className="error-state-card__title">تعذر تحميل الفروع</span>
                  <span className="error-state-card__desc">تحقق من الاتصال وحاول مجددًا.</span>
                  <button
                    onClick={loadBranches}
                    className="button button--secondary"
                    style={{ marginTop: 8, fontSize: 12, height: 36 }}
                  >
                    إعادة المحاولة
                  </button>
                </div>
              )}
              {!isLoading && !error && branches.length === 0 && (
                <div className="empty-state-card">
                  <span className="empty-state-card__icon">
                    <Icon name="grid" />
                  </span>
                  <span className="empty-state-card__title">لا توجد فروع</span>
                  <span className="empty-state-card__desc">
                    لم يتم إنشاء أي فروع بعد. ستظهر هنا تلقائيًا بعد الإضافة.
                  </span>
                </div>
              )}
              {!isLoading && !error && branches.map((branch) => (
                <div key={branch.id} className="committee-item">
                  <div>
                    <strong>{branch.name}</strong>
                    <small>{branch.slug}</small>
                  </div>
                  <div className="committee-score-box">
                    <span
                      title={`${branch.activeMembers} عضو نشط`}
                      style={{ color: branch.activeMembers > 0 ? "var(--success)" : "var(--muted)" }}
                    >
                      {branch.activeMembers}
                    </span>
                    <small>{branch.memberCount} عضو</small>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>ملخص الفروع</h2>
              <span>حالة التشغيل</span>
            </header>
            <div className="mission-list">
              <div className="mission-item">
                <span className="mission-icon">
                  <Icon name="check" />
                </span>
                <span>كل فرع مستمد مباشرة من جدول المنظمات.</span>
              </div>
              <div className="mission-item">
                <span className="mission-icon">
                  <Icon name="check" />
                </span>
                <span>عدد المستخدمين يقيس حجم النشاط في كل فرع.</span>
              </div>
              <div className="mission-item">
                <span className="mission-icon">
                  <Icon name="check" />
                </span>
                <span>عدد الاشتراكات يعكس حالة العضوية والخدمة.</span>
              </div>
            </div>
            {!isLoading && !error && branches.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div className="notice">
                  <strong>آخر مزامنة:</strong>{" "}
                  {new Date(branches[0]?.createdAt ?? Date.now()).toLocaleDateString("ar-SA")}
                </div>
              </div>
            )}
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
