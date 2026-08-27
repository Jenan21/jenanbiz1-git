"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

type SummaryPayload = {
  totalRobots: number;
  visibleRobots: number;
  reviewRobots: number;
  hiddenRobots: number;
  averageIntelligence: number;
  committeeApprovalRate: number;
  leaders: Array<{ name: string; score: number; reward: string }>;
};

export function AdminOverviewDashboard() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  async function loadSummary() {
    setIsLoading(true);
    setError(false);
    fetch("/api/admin/summary", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success && payload.summary) {
          setSummary({
            totalRobots: payload.summary.totalRobots,
            visibleRobots: payload.summary.visibleRobots,
            reviewRobots: payload.summary.reviewRobots,
            hiddenRobots: payload.summary.hiddenRobots,
            averageIntelligence: payload.summary.averageIntelligence,
            committeeApprovalRate: payload.summary.committeeApprovalRate,
            leaders: payload.summary.leaders,
          });
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    const locale = document.cookie.match(/(?:^|;\s*)locale=(ar|en)(?:;|$)/)?.[1];
    const frame = window.requestAnimationFrame(() => setLang(locale === "en" ? "en" : "ar"));
    let active = true;
    fetch("/api/admin/summary", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        if (payload?.success && payload.summary) {
          setSummary({
            totalRobots: payload.summary.totalRobots,
            visibleRobots: payload.summary.visibleRobots,
            reviewRobots: payload.summary.reviewRobots,
            hiddenRobots: payload.summary.hiddenRobots,
            averageIntelligence: payload.summary.averageIntelligence,
            committeeApprovalRate: payload.summary.committeeApprovalRate,
            leaders: payload.summary.leaders,
          });
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      window.cancelAnimationFrame(frame);
      active = false;
    };
  }, []);

  const currentSummary = summary ?? {
    totalRobots: 0,
    visibleRobots: 0,
    reviewRobots: 0,
    hiddenRobots: 0,
    averageIntelligence: 0,
    committeeApprovalRate: 0,
    leaders: [],
  };

  const metrics = [
    {
      label: lang === "ar" ? "الروبوتات النشطة" : "Visible robots",
      value: currentSummary.visibleRobots,
      delta: "DB",
      detail: lang === "ar" ? "من قاعدة البيانات" : "from database",
    },
    {
      label: lang === "ar" ? "قيد المراجعة" : "Under review",
      value: currentSummary.reviewRobots,
      delta: "LIVE",
      detail: lang === "ar" ? "تحتاج تقييماً" : "needs review",
    },
    {
      label: lang === "ar" ? "متوسط الذكاء" : "Avg. intelligence",
      value: `${currentSummary.averageIntelligence}%`,
      delta: "REAL",
      detail: lang === "ar" ? "مؤشر فعلي" : "live metric",
    },
    {
      label: lang === "ar" ? "معدل الموافقة" : "Approval rate",
      value: `${currentSummary.committeeApprovalRate}%`,
      delta: "AUDIT",
      detail: lang === "ar" ? "كفاءة لجنة القرار" : "decision quality",
    },
  ];

  const operationalPillars = [
    { name: lang === "ar" ? "العمليات" : "Operations", value: "92%", tone: "cyan" },
    { name: lang === "ar" ? "الذكاء" : "Intelligence", value: "96%", tone: "violet" },
    { name: lang === "ar" ? "التسليم" : "Delivery", value: "89%", tone: "green" },
    { name: lang === "ar" ? "الأمان" : "Security", value: "99%", tone: "amber" },
  ];

  const priorities = [
    { title: lang === "ar" ? "تحديث تلقائي للفرع العربي" : "Regional Arabic rollout", progress: 78, status: lang === "ar" ? "قيد التنفيذ" : "In motion" },
    { title: lang === "ar" ? "فحص سلاسل الموافقة" : "Approval chain audit", progress: 63, status: lang === "ar" ? "مراجعة" : "Review" },
    { title: lang === "ar" ? "تحسين جودة التفاعل" : "Experience quality uplift", progress: 84, status: lang === "ar" ? "مستقر" : "Stable" },
  ];

  const activities = [
    { time: "09:42", item: lang === "ar" ? "تمت مراجعة ثلاث مقترحات من اللجنة" : "Three committee proposals were reviewed", tone: "good" },
    { time: "08:15", item: lang === "ar" ? "تم توزيع مهام جديدة على فريق التشغيل" : "New operational tasks assigned to the team", tone: "info" },
    { time: "Yesterday", item: lang === "ar" ? "تحسن معدل الإنجاز عبر المنصة" : "Platform completion rate improved across regions", tone: "accent" },
  ];

  const teamLoad = [
    { name: lang === "ar" ? "فريق الروبوتات" : "Robotics team", value: 81 },
    { name: lang === "ar" ? "التسويق" : "Marketing", value: 69 },
    { name: lang === "ar" ? "العمليات" : "Operations", value: 76 },
    { name: lang === "ar" ? "الدعم" : "Support", value: 58 },
  ];

  return (
    <main className="command-dashboard" dir={lang === "ar" ? "rtl" : "ltr"}>
      <section className="dashboard-hero glass-panel">
        <div className="dashboard-hero__copy">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            {lang === "ar" ? "لوحة القيادة" : "Executive dashboard"}
          </span>
          <h1>{lang === "ar" ? "مركز التحكم العالمي" : "Global command center"}</h1>
          <p>
            {lang === "ar"
              ? "منصة متكاملة لمتابعة الأداء، تقييم الفريق، والقرارات التشغيلية في لحظة واحدة."
              : "A unified operating layer to monitor performance, track execution, and guide decisions in real time."}
          </p>
          <div className="dashboard-actions">
            <button type="button" className="button button--primary" onClick={() => void loadSummary()} disabled={isLoading}>
              {lang === "ar" ? "تحديث البيانات" : "Refresh data"}
            </button>
            <Link href="/admin/reports" className="button button--secondary">
              {lang === "ar" ? "عرض التقارير" : "View reports"}
            </Link>
          </div>
        </div>

        <div className="dashboard-hero__summary">
          <div className="summary-ring">
            <div>
              <strong>{isLoading ? "..." : currentSummary.totalRobots}</strong>
              <small>{lang === "ar" ? "إجمالي الروبوتات" : "total robots"}</small>
            </div>
          </div>
          <div className="summary-metrics">
            {operationalPillars.map((item) => (
              <div key={item.name} className={`summary-pill summary-pill--${item.tone}`}>
                <span>{item.name}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="kpi-grid">
        {metrics.map((item) => (
          <Card key={item.label} className="metric-card">
            <div className="metric-card__meta">
              <span>{item.label}</span>
              <strong>{item.delta}</strong>
            </div>
            <div className="metric-card__value">{item.value}</div>
            <small>{item.detail}</small>
          </Card>
        ))}
      </section>

      <section className="dashboard-grid">
        <Card className="panel panel--wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "مسار الأداء" : "Performance trend"}</p>
              <h2>{lang === "ar" ? "أداء المنصة" : "Platform performance"}</h2>
            </div>
            <span className="chip chip--success">{lang === "ar" ? "مستقر" : "steady"}</span>
          </div>
          <div className="chart-bars" aria-label="Performance chart">
            {(currentSummary.totalRobots === 0 ? [] : [currentSummary.hiddenRobots, currentSummary.reviewRobots, currentSummary.visibleRobots, currentSummary.averageIntelligence, currentSummary.committeeApprovalRate]).map((height, index) => (
              <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="chart-labels">
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
            <span>May</span>
            <span>Jun</span>
            <span>Jul</span>
            <span>Aug</span>
            <span>Sep</span>
            <span>Oct</span>
            <span>Nov</span>
            <span>Dec</span>
          </div>
        </Card>

        <Card className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "الابتكار" : "AI signal"}</p>
              <h2>{lang === "ar" ? "أولوية التنفيذ" : "Priority actions"}</h2>
            </div>
          </div>
          <div className="priority-list">
            {currentSummary.totalRobots === 0 ? <p className="dashboard-empty">لا توجد مؤشرات تشغيلية بعد.</p> : priorities.map((item) => (
              <div key={item.title} className="priority-item">
                <div className="priority-item__topline">
                  <strong>{item.title}</strong>
                  <span>{item.status}</span>
                </div>
                <div className="progress-bar">
                  <span style={{ width: `${item.progress}%` }} />
                </div>
                <small>{item.progress}%</small>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="bottom-grid">
        <Card className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "تحليل الفريق" : "Team balance"}</p>
              <h2>{lang === "ar" ? "تحميل الفريق" : "Team workload"}</h2>
            </div>
          </div>

          <div className="workload-list">
            {teamLoad.map((member) => (
              <div key={member.name} className="workload-item">
                <div className="workload-item__head">
                  <strong>{member.name}</strong>
                  <span>{member.value}%</span>
                </div>
                <div className="progress-bar progress-bar--small">
                  <span style={{ width: `${member.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "أحدث النشاط" : "Recent activity"}</p>
              <h2>{lang === "ar" ? "سجل العمليات" : "Operations log"}</h2>
            </div>
          </div>

          <div className="activity-feed">
            {error ? <p className="dashboard-error" role="alert">تعذر تحميل سجل العمليات.</p> : activities.map((entry) => (
              <div key={`${entry.time}-${entry.item}`} className="activity-item">
                <span className={`activity-dot activity-dot--${entry.tone}`} />
                <div>
                  <strong>{entry.time}</strong>
                  <p>{entry.item}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "قادة المنصة" : "Platform leaders"}</p>
              <h2>{lang === "ar" ? "أفضل المتصدرين" : "Top performers"}</h2>
            </div>
          </div>

          <div className="leader-list">
            {currentSummary.leaders.length === 0 ? <p className="dashboard-empty">لا توجد قيادات مسجلة بعد.</p> : currentSummary.leaders.map((leader) => (
              <div key={leader.name} className="leader-row">
                <div>
                  <strong>{leader.name}</strong>
                  <small>{leader.reward}</small>
                </div>
                <span>{leader.score}%</span>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}
