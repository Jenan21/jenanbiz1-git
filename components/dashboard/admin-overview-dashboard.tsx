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
  committeeReviews: number;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  totalOrganizations: number;
  pendingTasks: number;
  leaders: Array<{ name: string; score: number; reward: string }>;
  missionAssignments?: Array<{ name: string; requiredScore: number; assignedRobots: string[]; totalSkillGain: number }>;
  totalSkillGain?: number;
  readyRobots?: number;
  revenue: { succeededMinor: number; pendingMinor: number; currency: string };
  execution: { successful: number; failed: number; successRate: number };
  verifiedEvidence: number;
  unverifiedEvidence: number;
  topRobots: Array<{ id: string; name: string; team: string | null; status: string; intelligence: number; skill: number; experience: number; tasks: number; verifiedEvidence: number }>;
  recentAudit: Array<{ action: string; entityType: string; createdAt: string }>;
};

const emptySummary: SummaryPayload = {
  totalRobots: 0, visibleRobots: 0, reviewRobots: 0, hiddenRobots: 0, averageIntelligence: 0, committeeApprovalRate: 0,
  totalTasks: 0, activeTasks: 0, completedTasks: 0, totalOrganizations: 0, committeeReviews: 0, pendingTasks: 0,
  leaders: [], revenue: { succeededMinor: 0, pendingMinor: 0, currency: "SAR" }, execution: { successful: 0, failed: 0, successRate: 0 },
  verifiedEvidence: 0, unverifiedEvidence: 0, topRobots: [], recentAudit: [],
};

export function AdminOverviewDashboard() {
  const [lang, setLang] = useState<"ar" | "en">(() => {
    return "ar";
  });
  const [summary, setSummary] = useState<SummaryPayload>(emptySummary);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const locale = document.cookie
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith("locale="))
        ?.split("=")[1];
      const saved = localStorage.getItem("jenan-admin-lang");
      setLang(locale === "ar" || locale === "en" ? locale : saved === "ar" || saved === "en" ? saved : "ar");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    fetch("/api/admin/summary")
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
            totalTasks: payload.summary.totalTasks,
            activeTasks: payload.summary.activeTasks,
            completedTasks: payload.summary.completedTasks,
            totalOrganizations: payload.summary.totalOrganizations,
            pendingTasks: payload.summary.pendingTasks,
            committeeReviews: payload.summary.committeeReviews,
            leaders: payload.summary.leaders,
            revenue: payload.summary.revenue,
            execution: payload.summary.execution,
            verifiedEvidence: payload.summary.verifiedEvidence,
            unverifiedEvidence: payload.summary.unverifiedEvidence,
            topRobots: payload.summary.topRobots,
            recentAudit: payload.summary.recentAudit,
          });
        }
      })
      .catch(() => undefined);
  }, []);

  const metrics = [
    {
      label: lang === "ar" ? "الروبوتات النشطة" : "Visible robots",
      value: summary.visibleRobots,
      delta: `${summary.totalRobots}`,
      detail: lang === "ar" ? "مقارنة بالأسبوع الماضي" : "vs. last week",
    },
    {
      label: lang === "ar" ? "قيد المراجعة" : "Under review",
      value: summary.reviewRobots,
      delta: `${summary.pendingTasks ?? 0}`,
      detail: lang === "ar" ? "تحتاج تقييمًا سريعًا" : "needs quick review",
    },
    {
      label: lang === "ar" ? "متوسط الذكاء" : "Avg. intelligence",
      value: `${summary.averageIntelligence}%`,
      delta: `${summary.execution.successful}`,
      detail: lang === "ar" ? "مستوى الأداء العام" : "overall performance",
    },
    {
      label: lang === "ar" ? "معدل الموافقة" : "Approval rate",
      value: `${summary.committeeApprovalRate}%`,
      delta: `${summary.committeeReviews ?? 0}`,
      detail: lang === "ar" ? "كفاءة لجنة القرار" : "decision quality",
    },
  ];

  const operationalPillars = [
    { name: lang === "ar" ? "المهام النشطة" : "Active tasks", value: String(summary.activeTasks ?? 0), tone: "cyan" },
    { name: lang === "ar" ? "نجاح التنفيذ" : "Execution success", value: `${summary.execution.successRate}%`, tone: "violet" },
    { name: lang === "ar" ? "الأدلة الموثقة" : "Verified evidence", value: String(summary.verifiedEvidence), tone: "green" },
    { name: lang === "ar" ? "الإيرادات" : "Revenue", value: `${(summary.revenue.succeededMinor / 100).toLocaleString()} ${summary.revenue.currency}`, tone: "amber" },
  ];

  const priorities = [
    { title: lang === "ar" ? "مهام تنتظر الموافقة" : "Tasks awaiting approval", progress: summary.totalTasks ? Math.round((summary.pendingTasks / summary.totalTasks) * 100) : 0, status: String(summary.pendingTasks) },
    { title: lang === "ar" ? "أدلة تحتاج توثيقاً" : "Evidence needing verification", progress: summary.verifiedEvidence + summary.unverifiedEvidence ? Math.round((summary.unverifiedEvidence / (summary.verifiedEvidence + summary.unverifiedEvidence)) * 100) : 0, status: String(summary.unverifiedEvidence) },
    { title: lang === "ar" ? "تنفيذ فاشل يحتاج مراجعة" : "Failed executions to review", progress: summary.execution.failed, status: String(summary.execution.failed) },
  ];

  const activities = summary.recentAudit.map((entry) => ({ time: new Date(entry.createdAt).toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" }), item: `${entry.action} · ${entry.entityType}`, tone: "info" }));

  const platformTracks = [
    {
      title: lang === "ar" ? "منصة التشغيل" : "Operations platform",
      text: lang === "ar" ? "إدارة مطابقة الأداء، توزيع المهام، ورؤية اللحظة الحالية في وقت واحد." : "Operational alignment, task orchestration, and live execution visibility in one layer.",
      value: `${summary.activeTasks ?? 0}`,
    },
    {
      title: lang === "ar" ? "الذكاء التوليدي" : "Generative intelligence",
      text: lang === "ar" ? "مستودع شخصي للمهام والاستشارات والتوصيات باستخدام محرك قرار ذكي." : "Task-driven recommendations and strategic guidance generated from the platform intelligence core.",
      value: "Deferred",
    },
    {
      title: lang === "ar" ? "التوسع العالمي" : "Global expansion",
      text: lang === "ar" ? "مرونة في التوسع اللغوي والإقليمي مع أنظمة أمان ومعايير معتمدة." : "Regional and language expansion with governance, security, and enterprise-grade controls.",
      value: `${summary.totalOrganizations ?? 0}`,
    },
  ];

  const operatingTools = [
    { name: lang === "ar" ? "لوحة القيادة" : "Command board", status: lang === "ar" ? "نشط" : "Live" },
    { name: lang === "ar" ? "مركز الذكاء" : "Intelligence hub", status: lang === "ar" ? "مُشغَّل" : "Running" },
    { name: lang === "ar" ? "إدارة الروبوتات" : "Robot operations", status: lang === "ar" ? "قيد التوسع" : "Scaling" },
    { name: lang === "ar" ? "جودة الاختبارات" : "Test quality", status: lang === "ar" ? "مقبول" : "Healthy" },
  ];

  const phaseCompletion = [
    { label: lang === "ar" ? "لوحة التحكم" : "Control center", value: "مكتمل" },
    { label: lang === "ar" ? "مركز الذكاء" : "AI core", value: "جيد" },
    { label: lang === "ar" ? "الروبوتات" : "Robots", value: "تجريبي" },
    { label: lang === "ar" ? "المشاريع" : "Projects", value: "مستعد" },
  ];

  const robotMissions = summary.missionAssignments ?? [];

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
            <button type="button" className="button button--primary">
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
              <strong>{summary.totalRobots}</strong>
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

      <section className="capability-grid">
        {platformTracks.map((track) => (
          <Card key={track.title} className="signal-card">
            <div className="signal-card__top">
              <span>{track.title}</span>
              <strong>{track.value}</strong>
            </div>
            <p>{track.text}</p>
          </Card>
        ))}
      </section>

      <section className="tool-grid">
        <Card className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "الأدوات" : "Tooling"}</p>
              <h2>{lang === "ar" ? "أدوات التشغيل" : "Operating tools"}</h2>
            </div>
          </div>
          <div className="tool-list">
            {operatingTools.map((tool) => (
              <div key={tool.name} className="tool-row">
                <strong>{tool.name}</strong>
                <span>{tool.status}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "الآليات" : "Mechanisms"}</p>
              <h2>{lang === "ar" ? "مركز الذكاء والآليات" : "AI and mechanism hub"}</h2>
            </div>
          </div>
          <div className="tool-list">
            {robotMissions.map((mission) => (
              <div key={mission.name} className="tool-row tool-row--mission">
                <div>
                  <strong>{mission.name}</strong>
                  <small>{mission.assignedRobots.join(" • ") || (lang === "ar" ? "لا توجد مهمة حالياً" : "No active assignment")}</small>
                </div>
                <span>{mission.requiredScore}+</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "التجربة" : "Experiment"}</p>
              <h2>{lang === "ar" ? "حالة التجربة والاختبار" : "Trial and testing state"}</h2>
            </div>
          </div>
          <div className="phase-stack">
            {phaseCompletion.map((item) => (
              <div key={item.label} className="phase-item">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </Card>
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
            {[summary.totalTasks, summary.activeTasks, summary.pendingTasks, summary.completedTasks, summary.execution.successful, summary.execution.failed].map((value, index, values) => (
              <span key={`${value}-${index}`} style={{ height: `${Math.max(4, values.length ? (value / Math.max(...values, 1)) * 100 : 4)}%` }} />
            ))}
          </div>
          <div className="chart-labels">
            <span>{lang === "ar" ? "المهام" : "Tasks"}</span>
            <span>{lang === "ar" ? "النشطة" : "Active"}</span>
            <span>{lang === "ar" ? "المعلقة" : "Pending"}</span>
            <span>{lang === "ar" ? "المكتملة" : "Completed"}</span>
            <span>{lang === "ar" ? "الناجحة" : "Success"}</span>
            <span>{lang === "ar" ? "الفاشلة" : "Failed"}</span>
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
            {priorities.map((item) => (
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
        <Card className="panel panel--wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "الأسطول" : "Fleet"}</p>
              <h2>{lang === "ar" ? "أفضل 50 روبوتاً" : "Top 50 robots"}</h2>
            </div>
            <span className="chip">{summary.topRobots.length}/50</span>
          </div>
          <div className="leader-list">
            {summary.topRobots.slice(0, 50).map((robot) => (
              <div key={robot.id} className="leader-row">
                <div><strong>{robot.name}</strong><small>{robot.team ?? (lang === "ar" ? "بلا فريق" : "No team")} · {robot.status}</small></div>
                <span>{robot.intelligence}%</span>
              </div>
            ))}
            {!summary.topRobots.length && <p className="empty-state">{lang === "ar" ? "لا توجد روبوتات مسجلة." : "No robots are registered."}</p>}
          </div>
        </Card>
        <Card className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "توزيع المهام" : "Task distribution"}</p>
              <h2>{lang === "ar" ? "توزيع الروبوتات على المهام" : "Robot-to-task distribution"}</h2>
            </div>
          </div>

          <div className="workload-list">
            {robotMissions.map((mission) => (
              <div key={`${mission.name}-mission`} className="workload-item">
                <div className="workload-item__head">
                  <strong>{mission.name}</strong>
                  <span>{mission.assignedRobots.length}</span>
                </div>
                <div className="progress-bar progress-bar--small">
                  <span style={{ width: `${Math.min(100, mission.assignedRobots.length * 30 + mission.requiredScore)}%` }} />
                </div>
                <small>{mission.assignedRobots.join(" • ") || (lang === "ar" ? "لا يوجد توزيع" : "No allocation")}</small>
              </div>
            ))}
          </div>
        </Card>

        <Card className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "نمو المهارة" : "Skill growth"}</p>
              <h2>{lang === "ar" ? "زيادة المهارة" : "Skill uplift"}</h2>
            </div>
          </div>

          <div className="activity-feed">
            <div className="activity-item">
              <span className="activity-dot activity-dot--good" />
              <div>
                <strong>{lang === "ar" ? "إجمالي زيادة المهارة" : "Total skill gain"}</strong>
                <p>{summary.totalSkillGain ?? 0} pts</p>
              </div>
            </div>
            <div className="activity-item">
              <span className="activity-dot activity-dot--info" />
              <div>
                <strong>{lang === "ar" ? "روبوتات جاهزة" : "Ready robots"}</strong>
                <p>{summary.readyRobots ?? 0}</p>
              </div>
            </div>
            <div className="activity-item">
              <span className="activity-dot activity-dot--accent" />
              <div>
                <strong>{lang === "ar" ? "أفضل مهارة" : "Highest skill"}</strong>
                <p>{Math.max(...(robotMissions.flatMap((mission) => mission.assignedRobots.map(() => 90))), 0)}%</p>
              </div>
            </div>
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
            {activities.map((entry) => (
              <div key={`${entry.time}-${entry.item}`} className="activity-item">
                <span className={`activity-dot activity-dot--${entry.tone}`} />
                <div>
                  <strong>{entry.time}</strong>
                  <p>{entry.item}</p>
                </div>
              </div>
            ))}
            {!activities.length && <p className="empty-state">{lang === "ar" ? "لا توجد أحداث مسجلة." : "No audit events recorded."}</p>}
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
            {summary.leaders.map((leader) => (
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
