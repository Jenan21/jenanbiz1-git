import Link from "next/link";

import { ReportActions } from "@/components/reports/report-actions";
import type { ReportRoute } from "@/lib/reports/report-routes";
import { requireUser } from "@/lib/auth/session";
import { getReportView } from "@/services/reports/report-view-service";

export async function ReportPage({ path, projectId }: { path: ReportRoute; projectId?: string }) {
  const user = await requireUser(path);
  const report = await getReportView({ path, projectId, userId: user.id });
  const canPrint = report.sourceState === "LIVE";
  return (
    <main className="report-document" dir="rtl">
      <header className="report-document__header">
        <div className="report-document__brand"><span>J</span><div><strong>Jenan PRO</strong><small>وثيقة تشغيلية</small></div></div>
        <div><span className={`report-source report-source--${report.sourceState.toLowerCase()}`}>{report.sourceState}</span><small>{report.source ?? "لا يوجد مصدر متصل"}</small></div>
      </header>
      <section className="report-document__title">
        <p>REPORT CENTER</p><h1>{report.title}</h1><p>{report.subtitle}</p>
        <dl><div><dt>تاريخ التوليد</dt><dd>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "long", timeStyle: "short" }).format(report.generatedAt)}</dd></div><div><dt>المستخدم</dt><dd>{user.profile?.displayName ?? user.email}</dd></div><div><dt>حالة المصدر</dt><dd>{report.sourceState}</dd></div></dl>
      </section>
      <ReportActions canEmail={false} canPrint={canPrint} title={report.title} />
      <div className="report-document__sections">
        {report.sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.note ? <p className="report-document__note">{section.note}</p> : null}{section.rows.length ? <table><tbody>{section.rows.map((row) => <tr key={`${section.title}-${row.label}`}><th>{row.label}</th><td>{row.value}</td></tr>)}</tbody></table> : null}</section>)}
        {!report.sections.length ? <section className="report-document__empty"><h2>لا توجد بيانات تقرير</h2><p>أنشئ مشروعاً أو اختر سجلاً فعلياً ثم أعد فتح التقرير.</p></section> : null}
      </div>
      <footer><span>Jenan PRO · سجل مصدر قابل للمراجعة</span>{report.projectId ? <><Link href={`/projects/analysis/report?project=${report.projectId}`}>فتح مساحة المشروع</Link><a href={`/api/projects/${report.projectId}/report`}>تنزيل PDF الموثق</a></> : <Link href="/user/reports">العودة إلى التقارير</Link>}</footer>
    </main>
  );
}