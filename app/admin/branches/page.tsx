"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import {
  formatBranchDate,
  summarizeBranchMetrics,
} from "@/lib/admin/branch-metrics";

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
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [lang, setLang] = useState<"ar" | "en">("ar");

  const t =
    lang === "ar"
      ? {
          kicker: "الفروع",
          title: "شبكة المنظمات والفروع",
          subtitle:
            "عرض مباشر للفروع مع ملخصات تشغيلية واضحة للأعضاء والاشتراكات وحالة النشاط.",
          live: "مباشر",
          entityCount: "إجمالي الفروع",
          members: "إجمالي الأعضاء",
          activeMembers: "الأعضاء النشطون",
          subscriptions: "إجمالي الاشتراكات",
          newestBranch: "أحدث فرع",
          branchList: "قائمة الفروع",
          fromDatabase: "من قاعدة البيانات",
          branchSummary: "ملخص الفروع",
          healthStatus: "حالة التشغيل",
          noBranches: "لا توجد فروع بعد",
          noBranchesSub: "أنشئ أول فرع ليظهر هنا مع بياناته.",
          loading: "جارٍ تحميل بيانات الفروع...",
          error: "تعذر تحميل بيانات الفروع حاليًا.",
          retry: "إعادة المحاولة",
          membersUnit: "عضو",
          subscriptionsUnit: "اشتراك",
          points: [
            "المؤشرات تُحتسب مباشرة من بيانات قاعدة المنصة.",
            "تظهر الفروع الأحدث أولًا لتحسين المتابعة اليومية.",
            "عرض النشاط يوضح الفارق بين إجمالي الأعضاء والنشطين.",
          ],
        }
      : {
          kicker: "Branches",
          title: "Organization & branch network",
          subtitle:
            "Live branch visibility with clear operational summaries for members, subscriptions, and activity health.",
          live: "Live",
          entityCount: "Total branches",
          members: "Total members",
          activeMembers: "Active members",
          subscriptions: "Total subscriptions",
          newestBranch: "Latest branch",
          branchList: "Branch list",
          fromDatabase: "From database",
          branchSummary: "Branch summary",
          healthStatus: "Operational status",
          noBranches: "No branches yet",
          noBranchesSub:
            "Create your first branch to display its live metrics here.",
          loading: "Loading branch data...",
          error: "Unable to load branch data right now.",
          retry: "Retry",
          membersUnit: "members",
          subscriptionsUnit: "subscriptions",
          points: [
            "Metrics are calculated directly from platform data.",
            "Newest branches are listed first for daily monitoring.",
            "Activity view highlights the gap between total and active members.",
          ],
        };

  const summary = useMemo(() => summarizeBranchMetrics(branches), [branches]);

  const formattedNewestDate = formatBranchDate(
    summary.newestBranch?.createdAt,
    lang === "ar" ? "ar-SA" : "en-US",
  );

  async function loadBranches() {
    setStatus("loading");
    try {
      const response = await fetch("/api/admin/branches");
      const payload = (await response.json()) as {
        success?: boolean;
        branches?: BranchRecord[];
      };
      if (!response.ok || !payload?.success) {
        setStatus("error");
        return;
      }
      setBranches(payload.branches ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem("jenan-admin-lang");
    const locale = document.cookie.match(
      /(?:^|;\s*)locale=(ar|en)(?:;|$)/,
    )?.[1];
    const nextLanguage =
      saved === "ar" || saved === "en" ? saved : locale === "en" ? "en" : "ar";
    const frame = window.requestAnimationFrame(() => setLang(nextLanguage));
    const timer = window.setTimeout(() => {
      void loadBranches();
    }, 0);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <AdminShell>
      <main className="shell robot-admin-shell">
        <section className="robot-hero card">
          <div>
            <div className="kicker">{t.kicker}</div>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
          <div className="owner-summary">
            <span className="pill">
              <span className="live-dot" /> {t.live}
            </span>
            <strong>{summary.branchCount}</strong>
            <small>{t.entityCount}</small>
          </div>
        </section>

        <section className="branches-insights-grid">
          <Card className="branches-insight-card">
            <span>{t.members}</span>
            <strong>{summary.members}</strong>
          </Card>
          <Card className="branches-insight-card">
            <span>{t.activeMembers}</span>
            <strong>{summary.activeMembers}</strong>
          </Card>
          <Card className="branches-insight-card">
            <span>{t.subscriptions}</span>
            <strong>{summary.subscriptions}</strong>
          </Card>
          <Card className="branches-insight-card">
            <span>{t.newestBranch}</span>
            <strong>{formattedNewestDate}</strong>
          </Card>
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>{t.branchList}</h2>
              <span>{t.fromDatabase}</span>
            </header>
            <div className="committee-list">
              {status === "loading" ? (
                <div className="dashboard-empty" aria-live="polite">
                  <Icon name="activity" />
                  <span>{t.loading}</span>
                </div>
              ) : status === "error" ? (
                <div className="dashboard-error" role="alert">
                  <Icon name="x" />
                  <div>
                    <div>{t.error}</div>
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={loadBranches}
                    >
                      {t.retry}
                    </button>
                  </div>
                </div>
              ) : branches.length > 0 ? (
                branches.map((branch) => (
                  <div key={branch.id} className="committee-item branch-item">
                    <div>
                      <strong>{branch.name}</strong>
                      <small>{branch.slug}</small>
                      <small className="branch-item__meta">
                        {branch.subscriptionCount} {t.subscriptionsUnit}
                      </small>
                    </div>
                    <div className="committee-score-box">
                      <span>{branch.activeMembers}</span>
                      <small>
                        {branch.memberCount} {t.membersUnit}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <div className="committee-item">
                  <div>
                    <strong>{t.noBranches}</strong>
                    <small>{t.noBranchesSub}</small>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>{t.branchSummary}</h2>
              <span>{t.healthStatus}</span>
            </header>
            <div className="mission-list">
              {t.points.map((point) => (
                <div className="mission-item" key={point}>
                  <span className="mission-icon">✓</span>
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
