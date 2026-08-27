"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type DecisionItem = {
  id: string;
  title: string;
  robotName: string;
  status: "DRAFT" | "ACTIVE" | "PENDING_APPROVAL" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description?: string;
};

function statusLabel(status: DecisionItem["status"]) {
  switch (status) {
    case "ACTIVE":
      return "موافق";
    case "PENDING_APPROVAL":
      return "قيد الانتظار";
    case "IN_PROGRESS":
      return "قيد التنفيذ";
    case "COMPLETED":
      return "مكتمل";
    case "CANCELLED":
      return "ملغى";
    default:
      return "مسودة";
  }
}

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [feedback, setFeedback] = useState("");

  async function updateDecision(id: string, action: "approve" | "defer") {
    setFeedback("");
    const response = await fetch("/api/admin/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setFeedback(payload.message ?? "تعذر تحديث القرار");
      return;
    }
    setDecisions((current) => current.map((item) => item.id === id ? { ...item, status: action === "approve" ? "ACTIVE" : "PENDING_APPROVAL" } : item));
    setFeedback(action === "approve" ? "تم اعتماد المهمة." : "تم تأجيل المهمة للمراجعة.");
  }

  useEffect(() => {
    let active = true;

    fetch("/api/admin/decisions")
      .then((response) => response.json())
      .then((payload) => {
        if (!active || !payload?.success || !Array.isArray(payload.tasks)) return;
        setDecisions(payload.tasks);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div>
            <div className="kicker">لوحة القرارات</div>
            <h1>مركز موافقة المالك</h1>
            <p>
              راجع تخصيصات المهام وافق على أفضل الصائدين المناسبين وأجل المقترحات الضعيفة دون إظهار المرشحين الضعفاء على شاشة التشغيل الرئيسية.
            </p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> {decisions.length} مهام نشطة</span>
            <strong>{decisions.filter((task) => task.status === "ACTIVE").length} موافق عليها</strong>
            <small>{decisions.filter((task) => task.status !== "ACTIVE").length} قيد الانتظار أو مؤجلة</small>
          </div>
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>قائمة قرارات المهام</h2>
              <span>إجراء مطلوب</span>
            </header>
            <div className="decision-list">
              {decisions.length === 0 && <p className="placeholder-value">لا توجد قرارات محفوظة حالياً.</p>}
              {decisions.map((task) => (
                <div key={task.id} className="decision-card">
                  <div className="decision-head">
                    <strong>{task.title}</strong>
                    <span className={`decision-badge ${task.status.toLowerCase()}`}>{statusLabel(task.status)}</span>
                  </div>
                  <div className="decision-meta">
                    <small>{task.priority}</small>
                    <small>{task.robotName}</small>
                  </div>
                  <p>{task.description ?? "بدون تفاصيل إضافية"}</p>
                  <div className="decision-actions">
                    <button className="btn small primary" type="button" onClick={() => updateDecision(task.id, "approve")}>موافق</button>
                    <button className="btn small ghost" type="button" onClick={() => updateDecision(task.id, "defer")}>تأجيل</button>
                  </div>
                </div>
              ))}
            </div>
            {feedback && <p className="robot-generation-feedback" role="status">{feedback}</p>}
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>قواعد القرار</h2>
              <span>منطق المالك</span>
            </header>
            <div className="mission-list">
              <div className="mission-item">
                <span className="mission-icon">✓</span>
                <span>وافق على الصائد صاحب أعلى ذكاء وأقرب مطابقة للمهمة.</span>
              </div>
              <div className="mission-item">
                <span className="mission-icon">✓</span>
                <span>انقل الحالات المتوسطة إلى مسار مراجعة اللجنة.</span>
              </div>
              <div className="mission-item">
                <span className="mission-icon">✓</span>
                <span>أخفِ المهام الضعيفة من لوحة المالك حتى تتحسن.</span>
              </div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
