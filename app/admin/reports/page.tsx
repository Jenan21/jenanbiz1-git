"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type ReportSummary = {
  reports: Array<{ title: string; value: string; detail: string }>;
  leaders: Array<{ name: string; score: number; reward: string }>;
  averageIntelligence: number;
  totalRobots: number;
};

export default function ReportsPage() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [summary, setSummary] = useState<ReportSummary>({
    reports: [],
    leaders: [],
    averageIntelligence: 0,
    totalRobots: 0,
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const locale = document.cookie
          .split(";")
          .map((item) => item.trim())
          .find((item) => item.startsWith("locale="))
          ?.split("=")[1];
        const saved = localStorage.getItem("jenan-admin-lang");
        const nextLocale = locale === "ar" || locale === "en" ? locale : saved === "ar" || saved === "en" ? saved : "ar";
        setLang(nextLocale);
      } catch {
        setLang("ar");
      }
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    fetch("/api/admin/summary")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        const nextSummary = payload?.summary ?? {};
        setSummary({
          reports: Array.isArray(nextSummary.reports) ? nextSummary.reports : [],
          leaders: Array.isArray(nextSummary.leaders) ? nextSummary.leaders : [],
          averageIntelligence: Number(nextSummary.averageIntelligence ?? 0),
          totalRobots: Number(nextSummary.totalRobots ?? 0),
        });
      })
      .catch(() => undefined);
  }, []);

  const qaScore = Math.min(
    10,
    Math.round(
      (summary.totalRobots > 0 ? 3 : 0) +
      (summary.averageIntelligence >= 70 ? 3 : 0) +
      (summary.reports.length >= 4 ? 2 : 0) +
      (summary.leaders.length >= 1 ? 2 : 0),
    ),
  );

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir={lang === "ar" ? "rtl" : "ltr"}>
        <section className="robot-hero card">
          <div>
            <div className="kicker">{lang === "ar" ? "التقارير" : "REPORTS"}</div>
            <h1>{lang === "ar" ? "تقارير الذكاء اليومية" : "Daily Intelligence Reports"}</h1>
            <p>
              {lang === "ar"
                ? "تلخص هذه التقارير دورة 24 ساعة: توليد الصائدين، مراجعة اللجنة، الترقيات، وجودة توصيات المهام."
                : "This report suite summarizes the 24-hour intelligence cycle: robot generation, committee review, promotions, and task recommendation quality."}
            </p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> {lang === "ar" ? "تم تحديثه اليوم" : "updated today"}</span>
            <strong>{summary.averageIntelligence}%</strong>
            <small>{lang === "ar" ? "مؤشر جودة المنظومة" : "system quality index"}</small>
          </div>
        </section>

        <section className="panel qa-gate-panel" style={{ marginBottom: "20px" }}>
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "معيار الاعتماد" : "Approval standard"}</p>
              <h2>{lang === "ar" ? "جودة التقارير" : "Report quality"}</h2>
            </div>
            <span className={`chip ${qaScore >= 10 ? "chip--success" : "chip--warning"}`}>{qaScore}/10</span>
          </div>
        </section>

        <section className="stats-grid stats-grid--admin">
          {summary.reports.map((item) => (
            <Card key={item.title} className="stat-card">
              <span className="stat-card__icon accent-2" />
              <div>
                <p>{item.title}</p>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            </Card>
          ))}
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>{lang === "ar" ? "تدفق النشاط خلال 24 ساعة" : "24h activity flow"}</h2>
              <span>{lang === "ar" ? "سجل الدورة" : "cycle log"}</span>
            </header>
            <div className="timeline-list">
              {summary.leaders.length > 0 ? summary.leaders.map((item, index) => (
                <div key={`${item.name}-${index}`} className="timeline-item">
                  <span>{String(index + 1).padStart(2, "0")}:00</span>
                  <strong>{item.name} · {item.score}% · {item.reward}</strong>
                </div>
              )) : (
                <div className="timeline-item"><span>--:--</span><strong>{lang === "ar" ? "لا توجد بيانات بعد" : "No data available yet"}</strong></div>
              )}
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>{lang === "ar" ? "ملخص تنفيذي" : "Executive summary"}</h2>
              <span>{lang === "ar" ? "رؤية المالك" : "owner view"}</span>
            </header>
            <div className="mission-list">
              <div className="mission-item"><span className="mission-icon">✓</span><span>{lang === "ar" ? `المنظومة الحالية تحتوي على ${summary.totalRobots} روبوت في قاعدة البيانات.` : `The active system currently contains ${summary.totalRobots} robots in the database.`}</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>{lang === "ar" ? `متوسط الذكاء الحالي هو ${summary.averageIntelligence}%.` : `Current average intelligence is ${summary.averageIntelligence}%.`}</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>{lang === "ar" ? "التقارير تستند إلى القيم الحقيقية من قاعدة البيانات." : "Reports are based on real values from the application database."}</span></div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
