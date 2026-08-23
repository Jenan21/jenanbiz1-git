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
  missionAssignments?: Array<{ name: string; requiredScore: number; assignedRobots: string[]; totalSkillGain: number }>;
  totalSkillGain?: number;
  readyRobots?: number;
};

const fallbackSummary: SummaryPayload = {
  totalRobots: 48,
  visibleRobots: 23,
  reviewRobots: 7,
  hiddenRobots: 4,
  averageIntelligence: 91,
  committeeApprovalRate: 87,
  leaders: [
    { name: "Core Dev Prime", score: 98, reward: "Global Runner" },
    { name: "Signal Forge", score: 96, reward: "Strategic Growth" },
    { name: "Trust Pilot", score: 94, reward: "Ops Excellence" },
  ],
};

export function AdminOverviewDashboard() {
  const [lang] = useState<"ar" | "en">(() => {
    if (typeof window === "undefined") return "ar";
    const saved = localStorage.getItem("jenan-admin-lang");
    return saved === "ar" || saved === "en" ? saved : "ar";
  });
  const [summary, setSummary] = useState<SummaryPayload>(fallbackSummary);

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
            leaders: payload.summary.leaders,
          });
        }
      })
      .catch(() => undefined);
  }, []);

  const metrics = [
    {
      label: lang === "ar" ? "الروبوتات النشطة" : "Visible robots",
      value: summary.visibleRobots,
      delta: "+12%",
      detail: lang === "ar" ? "مقارنة بالأسبوع الماضي" : "vs. last week",
    },
    {
      label: lang === "ar" ? "قيد المراجعة" : "Under review",
      value: summary.reviewRobots,
      delta: "+3",
      detail: lang === "ar" ? "تحتاج تقييمًا سريعًا" : "needs quick review",
    },
    {
      label: lang === "ar" ? "متوسط الذكاء" : "Avg. intelligence",
      value: `${summary.averageIntelligence}%`,
      delta: "+5.2%",
      detail: lang === "ar" ? "مستوى الأداء العام" : "overall performance",
    },
    {
      label: lang === "ar" ? "معدل الموافقة" : "Approval rate",
      value: `${summary.committeeApprovalRate}%`,
      delta: "+8.1%",
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

  const platformTracks = [
    {
      title: lang === "ar" ? "منصة التشغيل" : "Operations platform",
      text: lang === "ar" ? "إدارة مطابقة الأداء، توزيع المهام، ورؤية اللحظة الحالية في وقت واحد." : "Operational alignment, task orchestration, and live execution visibility in one layer.",
      value: "98%",
    },
    {
      title: lang === "ar" ? "الذكاء التوليدي" : "Generative intelligence",
      text: lang === "ar" ? "مستودع شخصي للمهام والاستشارات والتوصيات باستخدام محرك قرار ذكي." : "Task-driven recommendations and strategic guidance generated from the platform intelligence core.",
      value: "96%",
    },
    {
      title: lang === "ar" ? "التوسع العالمي" : "Global expansion",
      text: lang === "ar" ? "مرونة في التوسع اللغوي والإقليمي مع أنظمة أمان ومعايير معتمدة." : "Regional and language expansion with governance, security, and enterprise-grade controls.",
      value: "94%",
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

  const robotMissions = summary.missionAssignments ?? [
    { name: lang === "ar" ? "تصميم الواجهة" : "Interface Design", requiredScore: 90, assignedRobots: ["Core Dev Prime", "Signal Forge"], totalSkillGain: 198 },
    { name: lang === "ar" ? "أتمتة التشغيل" : "Operations Automation", requiredScore: 88, assignedRobots: ["Pulse Monitor", "Trust Pilot"], totalSkillGain: 184 },
    { name: lang === "ar" ? "بحث النمو" : "Growth research", requiredScore: 80, assignedRobots: ["Growth Atlas", "Launch Vector"], totalSkillGain: 160 },
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
            {[32, 58, 44, 76, 62, 90, 82, 96, 88, 74, 92, 98].map((height, index) => (
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
