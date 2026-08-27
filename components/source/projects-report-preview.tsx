import Image from "next/image";
import Link from "next/link";

import { PlatformShell } from "@/components/source/source-ui";
import type { Locale } from "@/types/i18n";

type ReportVariant = "executive" | "feasibility" | "evaluation";
const reportCopy = {
  executive: { code: "EXECUTIVE / 01", title: ["معاينة الملخص التنفيذي", "Executive summary preview"], sections: [["ملخص المشروع", "Project summary"], ["محاور القرار", "Decision axes"], ["خارطة الطريق", "Roadmap"]] },
  feasibility: { code: "FEASIBILITY / 02", title: ["معاينة تقرير دراسة الجدوى", "Feasibility report preview"], sections: [["فرضيات السوق", "Market assumptions"], ["البصمة المالية", "Financial footprint"], ["هيكل القرار", "Decision structure"]] },
  evaluation: { code: "EVALUATION / 03", title: ["معاينة تقرير تقييم المشروع", "Project evaluation preview"], sections: [["نطاق التقييم", "Evaluation scope"], ["بوصلة الجاهزية", "Readiness compass"], ["مساحة التوصية", "Recommendation space"]] },
} as const;

function ReportSignal({ variant }: { variant: ReportVariant }) {
  if (variant === "evaluation") return <svg viewBox="0 0 160 160" aria-hidden="true"><polygon points="80,16 143,62 119,136 41,136 17,62" /><polygon className="gold" points="80,44 119,72 105,116 55,112 42,70" /><path d="M80 16v120M17 62l102 74M143 62 41 136" /></svg>;
  if (variant === "feasibility") return <svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="60" /><circle cx="80" cy="80" r="34" /><path d="M20 80h120M80 20v120" /><path className="gold" d="m38 110 28-28 22 13 34-48" /></svg>;
  return <svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="57" /><path d="M23 80h114M80 23v114M40 40l80 80M120 40l-80 80" /><circle className="gold" cx="80" cy="80" r="18" /></svg>;
}

export function ProjectsReportPreview({ locale, userLabel, variant }: { locale: Locale; userLabel: string; variant: ReportVariant }) {
  const ar = locale === "ar";
  const copy = reportCopy[variant];
  const pick = (value: readonly [string, string]) => ar ? value[0] : value[1];
  return (
    <PlatformShell locale={locale} activeRoute="/projects" userLabel={userLabel} immersive>
      <section className={"projects-report projects-report--" + variant} aria-labelledby="projects-report-title">
        <header className="projects-report__top">
          <Link href="/projects-showcase-review" className="projects-report__back">← {ar ? "قسم المشاريع" : "Projects"}</Link>
          <div className="projects-report__tools" aria-label={ar ? "أدوات المعاينة" : "Preview tools"}>
            <button className="projects-report__tool" type="button" disabled>{ar ? "طباعة — غير مفعلة" : "Print — inactive"}</button>
            <button className="projects-report__tool" type="button" disabled>{ar ? "تصدير PDF — غير مفعّل" : "PDF export — inactive"}</button>
          </div>
        </header>
        <div className="projects-report__canvas">
          <aside className="projects-report__rail" aria-label={ar ? "صفحات التقرير" : "Report pages"}>
            <small>REPORT MAP</small>
            {copy.sections.map((section, index) => <div className={"projects-report__thumb" + (index === 0 ? " active" : "")} key={section[1]}><b>0{index + 1}</b><span>{pick(section)}</span></div>)}
          </aside>
          <article className="projects-report__paper">
            <header className="projects-report__paper-head">
              <div className="projects-report__logo"><Image src="/assets/jenan-biz-logo-transparent.png" alt="Jenan BIZ" width={997} height={611} priority /></div>
              <div><small>{copy.code}</small><h1 id="projects-report-title">{pick(copy.title)}</h1></div>
              <span className="projects-report__status">{ar ? "هيكل تجريبي" : "SAMPLE STRUCTURE"}</span>
            </header>
            <div className="projects-report__lead">
              <section className="projects-report__section"><small>PROJECT CONTEXT</small><h2>{pick(copy.sections[0])}</h2><div className="projects-report__placeholder">{ar ? "مساحة مخصصة للمحتوى المعتمد لاحقًا. لا توجد نتائج أو توصيات فعلية في هذه المعاينة." : "Reserved for approved content. This preview contains no live results or recommendations."}</div></section>
              <section className="projects-report__section projects-report__signal"><ReportSignal variant={variant} /></section>
            </div>
            <div className="projects-report__grid">
              <section className="projects-report__section"><small>VISUAL MODEL</small><h2>{pick(copy.sections[1])}</h2><div className="projects-report__bars" aria-hidden="true">{[42, 68, 54, 82, 61, 74].map((height) => <i key={height} style={{ height: height + "%" }} />)}</div></section>
              <section className="projects-report__section"><small>DECISION SPACE</small><h2>{pick(copy.sections[2])}</h2><div className="projects-report__placeholder">{ar ? "حقول وجداول تخطيطية قابلة للربط لاحقًا من لوحة التحكم." : "Planning fields and tables ready for later admin integration."}</div></section>
            </div>
            <table className="projects-report__table"><thead><tr><th>{ar ? "المحور" : "Axis"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "الملاحظات" : "Notes"}</th></tr></thead><tbody>{copy.sections.map((section) => <tr key={section[1]}><td>{pick(section)}</td><td>—</td><td>{ar ? "بانتظار البيانات المعتمدة" : "Awaiting approved data"}</td></tr>)}</tbody></table>
          </article>
        </div>
      </section>
    </PlatformShell>
  );
}
