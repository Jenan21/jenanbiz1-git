import Link from "next/link";
import type { CSSProperties } from "react";
import { PlatformShell } from "@/components/source/source-ui";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Pair = readonly [string, string];

const teams: ReadonlyArray<{
  code: string;
  icon: IconName;
  name: Pair;
  mission: Pair;
  skills: ReadonlyArray<Pair>;
}> = [
  {
    code: "DEV",
    icon: "settings",
    name: ["فريق التطوير والهندسة", "Development & Engineering"],
    mission: [
      "يبني النماذج والواجهات والعقود التقنية تحت مراجعة بشرية.",
      "Builds product concepts, interfaces, and technical contracts under human review.",
    ],
    skills: [
      ["الهندسة", "Engineering"],
      ["الجودة", "Quality"],
      ["التوثيق", "Documentation"],
    ],
  },
  {
    code: "INN",
    icon: "sparkles",
    name: ["فريق الابتكار والبحث", "Innovation & Research"],
    mission: [
      "يجمع الفرضيات والفرص ويحوّلها إلى توصيات قابلة للتقييم.",
      "Turns researched opportunities and hypotheses into reviewable recommendations.",
    ],
    skills: [
      ["البحث", "Research"],
      ["الابتكار", "Innovation"],
      ["التحقق", "Validation"],
    ],
  },
  {
    code: "SUP",
    icon: "shield",
    name: ["فريق الإشراف وضمان الجودة", "Supervision & Quality"],
    mission: [
      "يراجع المخرجات والمخاطر والالتزام قبل أي ترقية أو اعتماد.",
      "Reviews outputs, risks, and compliance before promotion or approval.",
    ],
    skills: [
      ["الإشراف", "Supervision"],
      ["المخاطر", "Risk"],
      ["الاعتماد", "Approval"],
    ],
  },
  {
    code: "MNT",
    icon: "activity",
    name: ["فريق الصيانة والاعتمادية", "Maintenance & Reliability"],
    mission: [
      "يصمم خطط الصحة والاستمرارية والاستجابة وإيقاف التشغيل الآمن.",
      "Designs health, continuity, response, and safe-stop plans.",
    ],
    skills: [
      ["الصيانة", "Maintenance"],
      ["الاعتمادية", "Reliability"],
      ["الاستجابة", "Response"],
    ],
  },
  {
    code: "UXO",
    icon: "people",
    name: ["فريق المتابعة وتجربة المستخدم", "User Experience Operations"],
    mission: [
      "يتابع رحلة المستخدم خطوة بخطوة ويصعّد الاحتياجات للمشرف.",
      "Follows the user journey step by step and escalates needs to the supervisor.",
    ],
    skills: [
      ["المتابعة", "Follow-up"],
      ["الدعم", "Support"],
      ["التجربة", "Experience"],
    ],
  },
  {
    code: "OUT",
    icon: "globe",
    name: ["فريق التواصل والانتشار المسؤول", "Responsible Outreach"],
    mission: [
      "يخطط للحضور العام عبر القنوات المعتمدة بهوية معلنة وموافقة بشرية.",
      "Plans public presence through approved channels with disclosed identity and human approval.",
    ],
    skills: [
      ["المحتوى", "Content"],
      ["المجتمع", "Community"],
      ["الامتثال", "Compliance"],
    ],
  },
];

const tr = (locale: Locale, pair: Pair) => pair[locale === "ar" ? 0 : 1];

export function AdminCommandCenter({
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
      activeRoute="/admin"
      userLabel={userLabel}
      admin
    >
      <section className="admin-command-hero glass">
        <div>
          <span className="eyebrow">JENAN COLLECTIVE INTELLIGENCE</span>
          <h1>
            {ar
              ? "مركز قيادة الخبرات والكفاءات"
              : "Expertise & Competency Command Center"}
          </h1>
          <p>
            {ar
              ? "تصميم إداري لتجميع المعرفة والمهارات داخل فرق روبوتية معرفية تحت إشراف بشري كامل. لا توجد وكلاء أو عمليات تعمل من هذه الصفحة."
              : "Global command center for organizing knowledge and skills into supervised cognitive teams. No agents or operations run from this page."}
          </p>
          <div className="admin-command-hero__badges">
            <span>
              <i />
              {ar ? "واجهة فقط — غير تشغيلية" : "Interface only — inactive"}
            </span>
            <span>
              <Icon name="shield" />
              {ar ? "الموافقة البشرية إلزامية" : "Human approval required"}
            </span>
          </div>
        </div>
        <div className="admin-core-visual" aria-hidden="true">
          <span className="admin-core-visual__ring admin-core-visual__ring--one" />
          <span className="admin-core-visual__ring admin-core-visual__ring--two" />
          <strong>J</strong>
          {["DEV", "INN", "SUP", "MNT", "UXO", "OUT"].map((code, index) => (
            <i key={code} style={{ "--team-index": index } as CSSProperties}>
              {code}
            </i>
          ))}
        </div>
      </section>

      <section className="admin-structure-stats">
        {[
          [
            ar ? "الفرق المخططة" : "Planned teams",
            "06",
            ar ? "هيكل تصميمي" : "Design structure",
          ],
          [
            ar ? "طبقات الإشراف" : "Supervision layers",
            "02",
            ar ? "مشرف ثم مدير" : "Supervisor then manager",
          ],
          [
            ar ? "بوابة الإدارة" : "Admin gate",
            "01",
            ar ? "اعتماد التوصيات" : "Recommendation approval",
          ],
          [
            ar ? "العمليات النشطة" : "Active operations",
            "00",
            ar ? "غير مفعّلة" : "Inactive",
          ],
        ].map(([label, value, note]) => (
          <article className="card admin-structure-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>

      <section className="admin-section-heading">
        <div>
          <span className="eyebrow">TEAM ARCHITECTURE</span>
          <h2>
            {ar
              ? "فرق صائدي الجوائز المعرفية"
              : "Cognitive Bounty Hunter Teams"}
          </h2>
          <p>
            {ar
              ? "كل فريق يرفع مخرجاته إلى مشرف ثم مدير، ولا تُرقّى أي توصية دون اعتماد الإدمن."
              : "Every team reports to a supervisor, then a manager; no recommendation is promoted without admin approval."}
          </p>
        </div>
        <Link href="/admin/bounty-hunters" className="button button--secondary">
          {ar ? "مركز المعرفة المتخصص" : "Specialized knowledge center"}{" "}
          <Icon name="arrow" />
        </Link>
      </section>

      <section className="admin-team-grid">
        {teams.map((team) => (
          <article className="card admin-team-card" key={team.code}>
            <header>
              <span className="admin-team-card__icon">
                <Icon name={team.icon} />
              </span>
              <div>
                <small>{team.code} / PLANNED</small>
                <h3>{tr(locale, team.name)}</h3>
              </div>
              <span className="badge">{ar ? "غير نشط" : "Inactive"}</span>
            </header>
            <p>{tr(locale, team.mission)}</p>
            <div className="admin-team-card__skills">
              {team.skills.map((skill) => (
                <span key={skill[1]}>{tr(locale, skill)}</span>
              ))}
            </div>
            <div className="admin-team-card__leadership">
              <span>
                <Icon name="user" />
                <small>{ar ? "المشرف" : "Supervisor"}</small>
                <strong>{ar ? "غير معيّن" : "Unassigned"}</strong>
              </span>
              <span>
                <Icon name="shield" />
                <small>{ar ? "المدير" : "Manager"}</small>
                <strong>{ar ? "غير معيّن" : "Unassigned"}</strong>
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="admin-command-grid">
        <article className="card admin-report-flow">
          <header>
            <span className="eyebrow">REPORTING CHAIN</span>
            <h2>
              {ar
                ? "سلسلة التقارير والتوصيات"
                : "Reports & Recommendations Chain"}
            </h2>
          </header>
          <div className="admin-report-flow__path">
            {[
              [ar ? "الفريق" : "Team", "people"],
              [ar ? "المشرف" : "Supervisor", "user"],
              [ar ? "المدير" : "Manager", "shield"],
              [ar ? "الإدمن" : "Admin", "dashboard"],
            ].map(([label, icon], index) => (
              <div key={label}>
                <span>
                  <Icon name={icon as IconName} />
                </span>
                <strong>{label}</strong>
                <small>
                  {index === 3
                    ? ar
                      ? "اعتماد نهائي"
                      : "Final approval"
                    : ar
                      ? "مراجعة وتصعيد"
                      : "Review & escalate"}
                </small>
              </div>
            ))}
          </div>
          <div className="admin-report-queue">
            <div>
              <span>
                {ar ? "تقارير بانتظار المراجعة" : "Reports awaiting review"}
              </span>
              <strong>—</strong>
            </div>
            <div>
              <span>{ar ? "توصيات للإدمن" : "Recommendations for admin"}</span>
              <strong>—</strong>
            </div>
            <div>
              <span>{ar ? "قرارات موثقة" : "Documented decisions"}</span>
              <strong>—</strong>
            </div>
          </div>
        </article>

        <aside className="card admin-outreach-guardrails">
          <header>
            <Icon name="globe" />
            <div>
              <span className="eyebrow">GOVERNED OUTREACH</span>
              <h2>
                {ar ? "ضوابط الانتشار العام" : "Public Outreach Guardrails"}
              </h2>
            </div>
          </header>
          <p>
            {ar
              ? "التصميم يسمح فقط بتواصل معلن ومتوافق مع شروط المنصات. لا حسابات خفية ولا تجاوز لآليات الكشف ولا نشر تلقائي."
              : "The design allows only disclosed, platform-compliant communication. No hidden accounts, detection evasion, or automated posting."}
          </p>
          <div>
            {[
              [
                ar ? "هوية معلنة ومعتمدة" : "Disclosed approved identity",
                "check",
              ],
              [
                ar
                  ? "موافقة بشرية قبل النشر"
                  : "Human approval before publishing",
                "user",
              ],
              [
                ar
                  ? "حدود معدل وشروط المنصة"
                  : "Rate limits and platform terms",
                "shield",
              ],
              [
                ar ? "سجل تدقيق وإيقاف فوري" : "Audit log and immediate stop",
                "activity",
              ],
            ].map(([label, icon]) => (
              <span key={label}>
                <Icon name={icon as IconName} />
                {label}
                <b>—</b>
              </span>
            ))}
          </div>
          <button className="button button--primary" type="button" disabled>
            {ar ? "التشغيل غير متاح" : "Activation unavailable"}
          </button>
        </aside>
      </section>

      <section className="card admin-recommendations">
        <header>
          <div>
            <span className="eyebrow">ADMIN DECISION DESK</span>
            <h2>{ar ? "مكتب توصيات الإدمن" : "Admin Recommendation Desk"}</h2>
          </div>
          <span className="badge warn">
            {ar ? "بانتظار مصدر موثوق" : "Awaiting trusted source"}
          </span>
        </header>
        <div className="admin-recommendations__empty">
          <Icon name="sparkles" />
          <strong>
            {ar ? "لا توجد توصيات مرفوعة" : "No recommendations submitted"}
          </strong>
          <p>
            {ar
              ? "عند تفعيل الفرق مستقبلًا ستصل هنا التقارير المراجعة مع الأدلة والمخاطر والقرار المقترح."
              : "When teams are activated later, reviewed reports will arrive here with evidence, risks, and a proposed decision."}
          </p>
        </div>
      </section>
    </PlatformShell>
  );
}
