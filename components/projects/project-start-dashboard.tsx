"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type FormEvent } from "react";
import { ProjectsCommandHeader } from "@/components/projects/projects-command-header";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type CreatedProject = { id: string };
type Copy = readonly [string, string];

const roadmap: ReadonlyArray<{ icon: IconName; title: Copy }> = [
  { icon: "sparkles", title: ["فكرة المشروع وتحليلها", "Idea and analysis"] },
  { icon: "mail", title: ["التسجيل والتأسيس", "Registration"] },
  { icon: "settings", title: ["التجهيز والبنية", "Setup"] },
  { icon: "people", title: ["بناء الفريق", "Team"] },
  { icon: "briefcase", title: ["الموردون والشراكات", "Vendors"] },
  { icon: "rocket", title: ["الإطلاق والنمو", "Launch and growth"] },
];

const budgetItems: ReadonlyArray<{ color: string; label: Copy; value: number }> = [
  { color: "#20aef5", label: ["التراخيص والتأسيس", "Licensing"], value: 15 },
  { color: "#51caff", label: ["التجهيزات والبنية", "Equipment"], value: 30 },
  { color: "#f2c95e", label: ["الموقع والإيجار", "Location"], value: 25 },
  { color: "#ff8571", label: ["التسويق والإطلاق", "Marketing"], value: 15 },
  { color: "#8e6be9", label: ["المخزون والمواد", "Inventory"], value: 10 },
  { color: "#21d8be", label: ["قانوني واستشاري", "Legal"], value: 5 },
];
const budgetBackground =
  "conic-gradient(#20aef5 0 15%, #51caff 15% 45%, #f2c95e 45% 70%, #ff8571 70% 85%, #8e6be9 85% 95%, #21d8be 95% 100%)";

function pick(value: Copy, locale: Locale) {
  return locale === "ar" ? value[0] : value[1];
}

export function ProjectStartDashboard({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [entityType, setEntityType] = useState("");
  const [city, setCity] = useState("");
  const [capital, setCapital] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const completedInputs = [idea, entityType, city, capital, timeframe, teamSize].filter(
    (value) => value.trim(),
  ).length;
  const readiness = Math.round((completedInputs / 6) * 100);
  const capitalValue = Number(capital) || 0;
  const readinessChecks = [
    { done: Boolean(idea), label: ar ? "فكرة محددة" : "Defined idea" },
    { done: Boolean(entityType), label: ar ? "كيان قانوني محدد" : "Legal entity selected" },
    { done: Boolean(city), label: ar ? "مدينة المشروع" : "Project city" },
    { done: capitalValue > 0, label: ar ? "ميزانية أولية" : "Initial budget" },
    { done: Boolean(teamSize), label: ar ? "حجم الفريق" : "Team size" },
    { done: Boolean(timeframe), label: ar ? "مدة زمنية" : "Timeline" },
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: idea.trim().slice(0, 160),
          description: [
            idea.trim(),
            `${ar ? "نوع الكيان" : "Entity"}: ${entityType}`,
            `${ar ? "المدينة" : "City"}: ${city}`,
            `${ar ? "رأس المال المبدئي" : "Initial capital"}: ${capital}`,
            `${ar ? "المدة المستهدفة" : "Target timeline"}: ${timeframe}`,
            `${ar ? "حجم الفريق" : "Team size"}: ${teamSize}`,
          ].join("\n"),
          countryCode: "SA",
          currency: "SAR",
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        result?: CreatedProject;
        success?: boolean;
      } | null;
      if (!response.ok || !payload?.success || !payload.result) {
        throw new Error(payload?.message ?? (ar ? "تعذر إنشاء المشروع." : "The project could not be created."));
      }
      router.push(`/projects/start/roadmap?project=${payload.result.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر بدء المشروع."
            : "The project could not be started.",
      );
      setBusy(false);
    }
  }

  return (
    <main
      className="project-start-dashboard"
      data-project-start-route="/projects/start"
      data-project-start-source="USER_INPUT_REQUIRED"
      dir={ar ? "rtl" : "ltr"}
    >
      <ProjectsCommandHeader active="start" locale={locale} userLabel={userLabel} />

      <section className="project-start-dashboard__hero">
        <div className="project-start-dashboard__hero-copy">
          <span>{ar ? "من الفكرة إلى الواقع" : "From idea to reality"}</span>
          <h1>{ar ? "بدء مشروع" : "Start a project"}</h1>
          <h2>{ar ? "ابدأ مشروعك بخطة تنفيذ واضحة" : "Launch with a clear delivery plan"}</h2>
          <p>{ar ? "حوّل فكرتك إلى مشروع حقيقي من خلال خطة تنفيذ متكاملة تشمل التأسيس والتراخيص والتمويل والفريق والموردين، مع متابعة دقيقة لكل خطوة حتى الإطلاق." : "Turn your idea into a real project through an integrated plan covering registration, licensing, budget, team, vendors, and launch."}</p>
        </div>
        <div className="project-start-dashboard__journey" aria-hidden="true">
          {roadmap.map((step, index) => <span key={step.title[0]}><Icon name={step.icon} /><b>{pick(step.title, locale)}</b><i>{index + 1}</i></span>)}
        </div>
        <aside>
          <span><Icon name="activity" /><i><b>{ar ? "خطة التنفيذ" : "Delivery plan"}</b><small>{ar ? "خطوات عملية وجدول زمني" : "Actionable steps and timeline"}</small></i></span>
          <span><Icon name="mail" /><i><b>{ar ? "إجراءات التأسيس" : "Registration procedures"}</b><small>{ar ? "التراخيص والجهات الحكومية" : "Licenses and authorities"}</small></i></span>
          <span><Icon name="wallet" /><i><b>{ar ? "الميزانية الأولية" : "Initial budget"}</b><small>{ar ? "تقدير التكاليف والموارد" : "Cost and resource planning"}</small></i></span>
          <span><Icon name="briefcase" /><i><b>{ar ? "الشركاء والموردون" : "Partners and vendors"}</b><small>{ar ? "بناء شبكة داعمة" : "Build a support network"}</small></i></span>
        </aside>
      </section>

      <form className="project-start-dashboard__form" onSubmit={submit}>
        <header><h2>{ar ? "أدخل بيانات مشروعك لبدء التنفيذ" : "Enter project data to begin delivery"}</h2></header>
        <div className="project-start-dashboard__fields">
          <label><span>{ar ? "فكرة المشروع *" : "Project idea *"}</span><div><Icon name="sparkles" /><input required minLength={2} maxLength={160} value={idea} onChange={(event) => setIdea(event.target.value)} placeholder={ar ? "اختر أو اكتب فكرة مشروعك..." : "Choose or enter your project idea..."}/></div></label>
          <label><span>{ar ? "نوع الكيان القانوني *" : "Legal entity *"}</span><div><Icon name="building" /><select required value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="">{ar ? "اختر نوع الكيان" : "Select entity"}</option><option value="LLC">{ar ? "شركة ذات مسؤولية محدودة" : "Limited liability company"}</option><option value="Sole Proprietorship">{ar ? "مؤسسة فردية" : "Sole proprietorship"}</option><option value="Joint Stock">{ar ? "شركة مساهمة" : "Joint-stock company"}</option></select></div></label>
          <label><span>{ar ? "المدينة *" : "City *"}</span><div><Icon name="globe" /><select required value={city} onChange={(event) => setCity(event.target.value)}><option value="">{ar ? "اختر المدينة" : "Select city"}</option><option value="Riyadh">{ar ? "الرياض" : "Riyadh"}</option><option value="Jeddah">{ar ? "جدة" : "Jeddah"}</option><option value="Dammam">{ar ? "الدمام" : "Dammam"}</option><option value="Makkah">{ar ? "مكة المكرمة" : "Makkah"}</option></select></div></label>
          <label><span>{ar ? "رأس المال المبدئي *" : "Initial capital *"}</span><div><Icon name="wallet" /><input required min="1" inputMode="numeric" type="number" value={capital} onChange={(event) => setCapital(event.target.value)} placeholder={ar ? "مثال: 500000 ريال" : "Example: 500000 SAR"}/></div></label>
          <label><span>{ar ? "المدة الزمنية المستهدفة *" : "Target timeline *"}</span><div><Icon name="activity" /><select required value={timeframe} onChange={(event) => setTimeframe(event.target.value)}><option value="">{ar ? "اختر المدة" : "Select duration"}</option><option value="3-6 months">{ar ? "3–6 أشهر" : "3–6 months"}</option><option value="6-12 months">{ar ? "6–12 شهرًا" : "6–12 months"}</option><option value="12-24 months">{ar ? "12–24 شهرًا" : "12–24 months"}</option></select></div></label>
          <label><span>{ar ? "حجم الفريق المبدئي *" : "Initial team size *"}</span><div><Icon name="people" /><select required value={teamSize} onChange={(event) => setTeamSize(event.target.value)}><option value="">{ar ? "اختر الحجم" : "Select size"}</option><option value="1-4">{ar ? "1–4 أشخاص" : "1–4 people"}</option><option value="5-10">{ar ? "5–10 أشخاص" : "5–10 people"}</option><option value="11-25">{ar ? "11–25 شخصًا" : "11–25 people"}</option></select></div></label>
        </div>
        {message ? <p role="alert">{message}</p> : null}
        <div className="project-start-dashboard__launch-row">
          <div className="project-start-dashboard__form-actions">
            <button type="submit" disabled={busy}><Icon name="rocket" />{busy ? (ar ? "جارٍ إنشاء المشروع..." : "Creating project...") : (ar ? "ابدأ المشروع" : "Start project")}</button>
            <Link href="/projects/start/new"><Icon name="plus" />{ar ? "تحميل المتطلبات" : "Open detailed requirements"}</Link>
            <span>{ar ? "تحصل على قائمة المتطلبات والإجراءات المخصصة لمشروعك" : "Receive a tailored requirements and procedures checklist"}</span>
          </div>
          <div className="project-start-dashboard__roadmap">
            <h3>{ar ? "رحلة إطلاق المشروع" : "Project launch journey"}</h3>
            <div>{roadmap.map((step, index) => <span className={index < completedInputs ? "is-complete" : undefined} key={step.title[0]}><i>{index + 1}</i><Icon name={step.icon} /><b>{pick(step.title, locale)}</b></span>)}</div>
          </div>
        </div>
      </form>

      <section className="project-start-dashboard__lower">
        <article className="project-start-dashboard__readiness">
          <header><h2>{ar ? "جاهزية بدء المشروع" : "Project readiness"}</h2></header>
          <div><span className="project-start-dashboard__score" style={{ "--score": `${readiness * 3.6}deg` } as CSSProperties}><b>{readiness}</b><small>/100</small></span><ul>{readinessChecks.map((check) => <li className={check.done ? "is-done" : undefined} key={check.label}><Icon name={check.done ? "check" : "activity"} />{check.label}</li>)}</ul></div>
        </article>

        <article className="project-start-dashboard__licenses">
          <header><h2>{ar ? "قائمة التراخيص والإجراءات" : "Licenses and procedures"}</h2><Link href="/projects/start/licenses">{ar ? "فتح القائمة" : "Open checklist"}</Link></header>
          <ul>{[ar ? "حجز الاسم التجاري" : "Reserve trade name", ar ? "التسجيل في وزارة التجارة" : "Commerce registration", ar ? "الحصول على السجل التجاري" : "Commercial registry", ar ? "التسجيل في الزكاة والضريبة" : "Tax registration", ar ? "التراخيص البلدية" : "Municipal licenses", ar ? "فتح حساب بنكي للشركة" : "Business bank account"].map((label, index) => <li className={index < Math.min(completedInputs, 2) ? "is-done" : undefined} key={label}><Icon name={index < Math.min(completedInputs, 2) ? "check" : "activity"} />{label}</li>)}</ul>
        </article>

        <article className="project-start-dashboard__timeline">
          <header><h2>{ar ? "الجدول الزمني للمشروع" : "Project timeline"}</h2></header>
          <ol><li><b>{ar ? "التأسيس والتراخيص" : "Registration"}</b><small>{ar ? "الشهر 1–2" : "Months 1–2"}</small></li><li><b>{ar ? "التجهيز والبنية" : "Setup"}</b><small>{ar ? "الشهر 3–4" : "Months 3–4"}</small></li><li><b>{ar ? "بناء الفريق" : "Team"}</b><small>{ar ? "الشهر 5–6" : "Months 5–6"}</small></li><li><b>{ar ? "الموردون والشراكات" : "Vendors"}</b><small>{ar ? "الشهر 7–9" : "Months 7–9"}</small></li><li><b>{ar ? "الإطلاق والتسويق" : "Launch"}</b><small>{ar ? "الشهر 10–12" : "Months 10–12"}</small></li></ol>
        </article>

        <article className="project-start-dashboard__budget">
          <header><h2>{ar ? "توزيع الميزانية الأولية" : "Initial budget allocation"}</h2><b>{capitalValue ? capitalValue.toLocaleString(ar ? "ar-SA" : "en-US") : "—"}</b></header>
          <div><span className="project-start-dashboard__donut" style={{ background: budgetBackground }}><i><b>{capitalValue ? `${Math.round(capitalValue / 1000)}K` : "—"}</b><small>{ar ? "ريال سعودي" : "SAR"}</small></i></span><ul>{budgetItems.map((item) => <li key={item.label[0]}><i style={{ background: item.color }} /><span>{pick(item.label, locale)}</span><b>{item.value}%</b></li>)}</ul></div>
        </article>

        <article className="project-start-dashboard__tasks">
          <header><h2>{ar ? "المهام والأعمال" : "Tasks and actions"}</h2><span>{completedInputs}/6</span></header>
          <ul>{readinessChecks.map((check) => <li className={check.done ? "is-done" : undefined} key={check.label}><Icon name={check.done ? "check" : "activity"} />{check.label}</li>)}</ul>
        </article>

        <article className="project-start-dashboard__team">
          <header><h2>{ar ? "الفريق والمناصب" : "Team and roles"}</h2><span>{teamSize || "—"}</span></header>
          <div>{[ar ? "المدير التنفيذي" : "Chief executive", ar ? "المدير المالي" : "Finance lead", ar ? "مدير العمليات" : "Operations lead", ar ? "مسؤول التسويق" : "Marketing lead"].map((role) => <span key={role}><Icon name="user" /><strong>{role}</strong><small>{ar ? "غير معيّن" : "Unassigned"}</small></span>)}</div>
        </article>

        <article className="project-start-dashboard__vendors">
          <header><h2>{ar ? "الموردون والشركاء" : "Vendors and partners"}</h2><Link href="/projects/start/vendors">{ar ? "إدارة الموردين" : "Manage vendors"}</Link></header>
          <div><Icon name="briefcase" /><strong>{ar ? "لا يوجد موردون مرتبطون بعد" : "No vendors linked yet"}</strong><small>{ar ? "أضف الموردين والشركاء بعد إنشاء المشروع." : "Add vendors and partners after creating the project."}</small></div>
        </article>

        <article className="project-start-dashboard__milestones">
          <header><h2>{ar ? "مراحل الإطلاق الرئيسية" : "Launch milestones"}</h2></header>
          <div>{[ar ? "إكمال التأسيس" : "Registration complete", ar ? "الانتهاء من التجهيزات" : "Setup complete", ar ? "توظيف الفريق" : "Team hired", ar ? "التشغيل التجريبي" : "Pilot operation", ar ? "الإطلاق الرسمي" : "Official launch"].map((label, index) => <span key={label}><i>{index + 1}</i><b>{label}</b><small>{ar ? "بانتظار المشروع" : "Awaiting project"}</small></span>)}</div>
        </article>

        <article className="project-start-dashboard__next">
          <header><h2>{ar ? "التوصيات والخطوات التالية" : "Recommendations and next steps"}</h2></header>
          <ol><li>{ar ? "أكمل البيانات الأساسية المطلوبة." : "Complete the required basic data."}</li><li>{ar ? "راجع قائمة التراخيص والإجراءات." : "Review licenses and procedures."}</li><li>{ar ? "حدد الفريق والموردين بعد إنشاء المشروع." : "Assign team members and vendors after creation."}</li><li>{ar ? "ابدأ التنفيذ بعد استيفاء بوابات الاعتماد." : "Begin delivery only after approval gates are complete."}</li></ol>
        </article>
      </section>
    </main>
  );
}
