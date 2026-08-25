import type { CSSProperties } from "react";
import { PlatformShell } from "@/components/source/source-ui";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Pair = readonly [string, string];

const channels: ReadonlyArray<{ icon: IconName; title: Pair; scope: Pair }> = [
  {
    icon: "people",
    title: ["الشبكات الاجتماعية", "Social networks"],
    scope: [
      "حسابات رسمية بهوية معلنة",
      "Official accounts with disclosed identity",
    ],
  },
  {
    icon: "briefcase",
    title: ["المجتمعات المهنية", "Professional communities"],
    scope: [
      "حضور متخصص ومحتوى موثّق",
      "Specialist presence and verified content",
    ],
  },
  {
    icon: "search",
    title: ["البحث والمحتوى", "Search & content"],
    scope: ["مواد عامة قابلة للتدقيق", "Public, auditable materials"],
  },
  {
    icon: "globe",
    title: ["الشراكات والقنوات", "Partners & channels"],
    scope: [
      "تعاون معلن وموافقات واضحة",
      "Disclosed collaboration with clear approvals",
    ],
  },
];

const approvalSteps: ReadonlyArray<{
  icon: IconName;
  title: Pair;
  note: Pair;
}> = [
  {
    icon: "sparkles",
    title: ["مسودة", "Draft"],
    note: ["المحتوى والهدف", "Content and intent"],
  },
  {
    icon: "shield",
    title: ["مراجعة الامتثال", "Compliance review"],
    note: ["الشروط والهوية", "Terms and identity"],
  },
  {
    icon: "user",
    title: ["اعتماد بشري", "Human approval"],
    note: ["قرار موثق", "Documented decision"],
  },
  {
    icon: "check",
    title: ["نشر يدوي", "Manual publish"],
    note: ["قناة معتمدة", "Approved channel"],
  },
];

const tr = (locale: Locale, pair: Pair) => pair[locale === "ar" ? 0 : 1];

export function AdminSocialGrowth({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  return (
    <PlatformShell
      locale={locale}
      activeRoute="/admin/social-growth"
      userLabel={userLabel}
      admin
    >
      <section className="growth-hero glass">
        <div className="growth-hero__copy">
          <span className="eyebrow">GOVERNED DIGITAL OUTREACH</span>
          <h1>
            {ar ? "مركز الانتشار المسؤول" : "Responsible Outreach Center"}
          </h1>
          <p>
            {ar
              ? "واجهة تخطيط لحضور Jenan BIZ العام عبر قنوات معتمدة وهوية معلنة وموافقة بشرية. لا توجد عمليات نشر أو حسابات تعمل من هذه الصفحة."
              : "A planning surface for Jenan BIZ public presence through approved channels, disclosed identity, and human approval. No publishing operations or accounts run from this page."}
          </p>
          <div className="growth-hero__badges">
            <span>
              <i />
              {ar ? "جميع القنوات غير متصلة" : "All channels disconnected"}
            </span>
            <span>
              <Icon name="shield" />
              {ar ? "الموافقة البشرية إلزامية" : "Human approval required"}
            </span>
          </div>
        </div>
        <div className="growth-radar" aria-hidden="true">
          <span>
            <Icon name="globe" />
          </span>
          {["CONTENT", "COMMUNITY", "PARTNERS", "SEARCH"].map(
            (label, index) => (
              <i
                key={label}
                style={{ "--growth-index": index } as CSSProperties}
              >
                {label}
              </i>
            ),
          )}
        </div>
      </section>

      <section className="growth-kpis">
        {[
          [
            ar ? "القنوات المعتمدة" : "Approved channels",
            "00",
            ar ? "لا قنوات" : "No channels",
          ],
          [
            ar ? "الحملات النشطة" : "Active campaigns",
            "00",
            ar ? "غير مفعّلة" : "Inactive",
          ],
          [
            ar ? "بانتظار الاعتماد" : "Awaiting approval",
            "—",
            ar ? "لا مصدر مهام" : "No task source",
          ],
          [
            ar ? "النشر الآلي" : "Automated publishing",
            "00",
            ar ? "غير مسموح" : "Not permitted",
          ],
        ].map(([label, value, note]) => (
          <article className="card growth-kpi" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>

      <section className="growth-heading">
        <div>
          <span className="eyebrow">CHANNEL GOVERNANCE</span>
          <h2>{ar ? "سجل القنوات المعتمدة" : "Approved channel registry"}</h2>
          <p>
            {ar
              ? "لا تصبح أي قناة نشطة قبل توثيق المالك والهوية وشروط الاستخدام."
              : "No channel becomes active before its owner, identity, and terms are documented."}
          </p>
        </div>
        <span className="badge warn">
          {ar ? "واجهة تخطيط فقط" : "Planning interface only"}
        </span>
      </section>

      <section className="growth-channel-grid">
        {channels.map((channel) => (
          <article className="card growth-channel" key={channel.title[1]}>
            <header>
              <span>
                <Icon name={channel.icon} />
              </span>
              <b>{ar ? "غير مربوط" : "Not connected"}</b>
            </header>
            <h3>{tr(locale, channel.title)}</h3>
            <p>{tr(locale, channel.scope)}</p>
            <div>
              <span>{ar ? "المالك" : "Owner"}</span>
              <strong>{ar ? "غير معيّن" : "Unassigned"}</strong>
            </div>
          </article>
        ))}
      </section>

      <section className="growth-approval card">
        <header>
          <div>
            <span className="eyebrow">HUMAN APPROVAL FLOW</span>
            <h2>
              {ar ? "مسار المحتوى قبل النشر" : "Pre-publish content flow"}
            </h2>
          </div>
          <span className="badge">{ar ? "غير نشط" : "Inactive"}</span>
        </header>
        <div className="growth-approval__path">
          {approvalSteps.map((step, index) => (
            <div key={step.title[1]}>
              <span>
                <Icon name={step.icon} />
              </span>
              <strong>{tr(locale, step.title)}</strong>
              <small>{tr(locale, step.note)}</small>
              {index < approvalSteps.length - 1 ? (
                <i aria-hidden="true" />
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="growth-command-grid">
        <article className="card growth-campaigns">
          <header>
            <div>
              <span className="eyebrow">CAMPAIGN DESK</span>
              <h2>
                {ar ? "مكتب الحملات والمحتوى" : "Campaign and content desk"}
              </h2>
            </div>
            <button className="button button--primary" type="button" disabled>
              {ar ? "حملة جديدة — غير متاح" : "New campaign — unavailable"}
            </button>
          </header>
          <div>
            <Icon name="briefcase" />
            <strong>{ar ? "لا توجد حملات" : "No campaigns"}</strong>
            <p>
              {ar
                ? "ستظهر هنا المسودات والأدلة والمراجعات والموافقات عند تفعيل سير عمل معتمد."
                : "Drafts, evidence, reviews, and approvals appear here once a governed workflow is active."}
            </p>
          </div>
        </article>
        <aside className="card growth-guardrails">
          <header>
            <Icon name="shield" />
            <div>
              <span className="eyebrow">NON-NEGOTIABLE GUARDRAILS</span>
              <h2>
                {ar ? "ضوابط لا يمكن تجاوزها" : "Non-negotiable guardrails"}
              </h2>
            </div>
          </header>
          <div>
            {[
              [ar ? "هوية معلنة" : "Disclosed identity", "check"],
              [ar ? "شروط المنصة" : "Platform terms", "shield"],
              [ar ? "موافقة بشرية" : "Human approval", "user"],
              [ar ? "سجل تدقيق" : "Audit trail", "activity"],
              [ar ? "إيقاف فوري" : "Immediate stop", "x"],
            ].map(([label, icon]) => (
              <span key={label}>
                <Icon name={icon as IconName} />
                {label}
                <b>—</b>
              </span>
            ))}
          </div>
          <p>
            {ar
              ? "لا حسابات خفية، لا تجاوز لآليات الكشف، ولا نشر تلقائي."
              : "No hidden accounts, detection evasion, or automated posting."}
          </p>
        </aside>
      </section>
    </PlatformShell>
  );
}
