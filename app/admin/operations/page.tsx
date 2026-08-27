"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type OperationsPayload = {
  stages: Array<{ stage: string; count: number; detail: string }>;
  missions: Array<{ title: string; owner: string; zone: string }>;
  approvedCount: number;
  users: number;
};

export default function OperationsPage() {
  const [lang] = useState<"ar" | "en">("ar");
  const [data, setData] = useState<OperationsPayload>({
    stages: [],
    missions: [],
    approvedCount: 0,
    users: 0,
  });

  useEffect(() => {
    fetch("/api/admin/operations")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success) {
          setData({
            stages: payload.operations?.stages ?? [],
            missions: payload.operations?.missions ?? [],
            approvedCount: payload.operations?.approvedCount ?? 0,
            users: payload.operations?.users ?? 0,
          });
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir={lang === "ar" ? "rtl" : "ltr"}>
        <section className="robot-hero card">
          <div>
            <div className="kicker">{lang === "ar" ? "مخطط العمليات" : "OPERATIONS PIPELINE"}</div>
            <h1>{lang === "ar" ? "محرك تدفق المهام" : "Mission flow engine"}</h1>
            <p>
              {lang === "ar"
                ? "يمر كل صائد جديد عبر التوليد والتقييم ومراجعة اللجنة والموافقة والتنفيذ المباشر. يرى المالك فقط المسار المؤهل والقيم بينما تبقى المرشحين الضعفاء مخفيين عن تدفق التشغيل."
                : "Every new robot passes through generation, scoring, committee validation, approval, and live execution. The owner sees only the qualified and high-value path while weak candidates remain hidden from operational flow."}
            </p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> {lang === "ar" ? "تدفق مباشر" : "live flow"}</span>
            <strong>{data.approvedCount}</strong>
            <small>{lang === "ar" ? "موافق للاستخدام" : "approved for operations"}</small>
          </div>
        </section>

        <section className="stats-grid stats-grid--admin">
          {data.stages.map((item) => (
            <Card key={item.stage} className="stat-card">
              <span className="stat-card__icon accent-4" />
              <div>
                <p>{item.stage}</p>
                <strong>{item.count}</strong>
                <small>{item.detail}</small>
              </div>
            </Card>
          ))}
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>{lang === "ar" ? "قائمة المهام النشطة" : "Active mission queue"}</h2>
              <span>{lang === "ar" ? "التشغيل الحالي" : "Current operations"}</span>
            </header>
            <div className="mission-list">
              {data.missions.length > 0 ? data.missions.map((item) => (
                <div key={item.title} className="mission-item">
                  <span className="mission-icon">✓</span>
                  <span>{item.title}</span>
                  <small>{item.owner} · {item.zone}</small>
                </div>
              )) : (
                <div className="mission-item"><span className="mission-icon">✓</span><span>{lang === "ar" ? "لا توجد مهام نشطة حالياً" : "No active missions yet"}</span></div>
              )}
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>{lang === "ar" ? "قواعد المسار" : "Pipeline rules"}</h2>
              <span>{lang === "ar" ? "مرشحات التشغيل" : "Operational filters"}</span>
            </header>
            <div className="mission-list">
              <div className="mission-item"><span className="mission-icon">✓</span><span>{lang === "ar" ? "تصفية تلقائية للصائدين الضعفاء قبل الوصول إلى التدفق المباشر" : "Auto-filter weak robots before they reach live flow"}</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>{lang === "ar" ? "تعمل مراجعة اللجنة كبوابة تحقق" : "Committee review acts as the validation gate"}</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>{lang === "ar" ? "يظهر فقط الصائدون الموافق عليهم في واجهة التشغيل" : "Only approved bots are shown in operations surfaces"}</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>{lang === "ar" ? "المستخدمون النشطون في المنصة: " + data.users : "Active users in platform: " + data.users}</span></div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
