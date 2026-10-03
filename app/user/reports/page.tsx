import Link from "next/link";
import { UserCenterNav } from "@/components/account/user-center-nav";
import { UserSectionHeader } from "@/components/account/user-section-header";
import { PlatformShell } from "@/components/custom/platform-shell";
import { Icon, type IconName } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getUserReportIndex } from "@/services/account/user-center-service";

export default async function UserReportsPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/user/reports"),
  ]);
  const reports = await getUserReportIndex(user.id);
  const ar = locale === "ar";
  const summary: Array<[IconName, number | string, string, string]> = [
    [
      "briefcase",
      reports.projects.length,
      ar ? "تقارير المشاريع" : "Project reports",
      ar ? "من سجلاتك" : "From your records",
    ],
    [
      "pieChart",
      "—",
      ar ? "تقارير الاستثمار" : "Investment reports",
      ar ? "المصدر غير متصل" : "Source not connected",
    ],
    [
      "wallet",
      "—",
      ar ? "الفواتير" : "Invoices",
      ar ? "من سجل المدفوعات" : "From payment history",
    ],
    [
      "activity",
      reports.activity.length,
      ar ? "أحداث حديثة" : "Recent events",
      ar ? "سجل التدقيق" : "Audit history",
    ],
  ];

  return (
    <PlatformShell
      locale={locale}
      activeRoute="/account"
      userLabel={user.profile?.displayName ?? user.email}
    >
      <UserCenterNav activeRoute="/user/reports" locale={locale} />
      <section className="user-center-page">
        <UserSectionHeader
          eyebrow={ar ? "مركز التقارير" : "REPORT CENTER"}
          title={ar ? "تقاريري" : "My reports"}
          description={
            ar
              ? "مخرجات حقيقية مرتبطة بسجلاتك فقط."
              : "Real outputs linked only to your persisted records."
          }
          action={
            <span className="user-finance__record-state">
              <Icon name="shield" />
              <span>
                <b>{ar ? "نطاق خاص" : "Private scope"}</b>
                <small>{ar ? "سجلات هذا الحساب" : "This account only"}</small>
              </span>
            </span>
          }
        />
        <div className="user-finance__summary user-reports__summary">
          {summary.map(([icon, value, label, note]) => (
            <article key={label}>
              <span className="user-investments__metric-icon">
                <Icon name={icon} />
              </span>
              <div>
                <strong>{value}</strong>
                <small>{label}</small>
                <span>{note}</span>
              </div>
            </article>
          ))}
        </div>
        <div className="user-report-library">
          <section className="user-report-library__projects">
            <header>
              <span className="user-investments__panel-icon">
                <Icon name="briefcase" />
              </span>
              <div>
                <h2>{ar ? "المشاريع" : "Projects"}</h2>
                <p>
                  {ar
                    ? "التقارير المرتبطة بالمشاريع الفعلية"
                    : "Reports linked to real projects"}
                </p>
              </div>
              <b>{reports.projects.length}</b>
            </header>
            <div className="user-report-library__list">
              {reports.projects.map((project) => (
                <article key={project.id}>
                  <div>
                    <strong>{project.name}</strong>
                    <span>
                      {project.status} · {project.currentPhase}
                    </span>
                  </div>
                  <Link
                    className="button button--ghost"
                    href={`/reports/view/general?project=${project.id}`}
                  >
                    {ar ? "عرض" : "View"}
                  </Link>
                </article>
              ))}
              {!reports.projects.length ? (
                <div className="user-report-library__empty">
                  <Icon name="briefcase" />
                  <strong>
                    {ar
                      ? "لا توجد تقارير مشاريع بعد"
                      : "No project reports yet"}
                  </strong>
                  <span>
                    {ar
                      ? "يظهر التقرير بعد إنشاء مشروع فعلي."
                      : "A report appears after a real project is created."}
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <header>
              <span className="user-investments__panel-icon">
                <Icon name="pieChart" />
              </span>
              <div>
                <h2>{ar ? "الاستثمار" : "Investment"}</h2>
                <p>
                  {ar
                    ? "تقارير المحفظة والأصول"
                    : "Portfolio and asset reports"}
                </p>
              </div>
              <b>—</b>
            </header>
            <div className="user-report-library__empty">
              <Icon name="lock" />
              <strong>
                {ar
                  ? "مصدر الاستثمار غير متصل"
                  : "Investment source not connected"}
              </strong>
              <span>
                {ar
                  ? "لا يُنشأ تقرير تقديري دون بيانات موثقة."
                  : "No estimated report is generated without verified data."}
              </span>
              <Link
                className="button button--ghost"
                href="/reports/view/portfolio"
              >
                {ar ? "عرض حالة التقرير" : "View report state"}
              </Link>
            </div>
          </section>

          <section>
            <header>
              <span className="user-investments__panel-icon">
                <Icon name="wallet" />
              </span>
              <div>
                <h2>{ar ? "الفواتير" : "Invoices"}</h2>
                <p>
                  {ar
                    ? "الفواتير والإيصالات المسجلة"
                    : "Recorded invoices and receipts"}
                </p>
              </div>
              <b>—</b>
            </header>
            <div className="user-report-library__empty">
              <Icon name="wallet" />
              <strong>
                {ar ? "تُدار من سجل المدفوعات" : "Managed from payment history"}
              </strong>
              <span>
                {ar
                  ? "افتح السجل لعرض أي فاتورة محفوظة فعليًا."
                  : "Open the history to view any persisted invoice."}
              </span>
              <Link className="button button--ghost" href="/user/payments">
                {ar ? "فتح المدفوعات" : "Open payments"}
              </Link>
            </div>
          </section>

          <section>
            <header>
              <span className="user-investments__panel-icon">
                <Icon name="grid" />
              </span>
              <div>
                <h2>{ar ? "تقارير محفوظة" : "Saved reports"}</h2>
                <p>
                  {ar ? "المخرجات التي حفظها المستخدم" : "User-saved outputs"}
                </p>
              </div>
              <b>—</b>
            </header>
            <div className="user-report-library__empty">
              <Icon name="shield" />
              <strong>
                {ar ? "لا توجد مخرجات محفوظة" : "No saved outputs"}
              </strong>
              <span>
                {ar
                  ? "لن نعرض ملفات غير موجودة أو تجريبية."
                  : "Missing or demo files are never presented as saved."}
              </span>
              <button className="button button--ghost" disabled type="button">
                {ar ? "تنزيل" : "Download"}
              </button>
            </div>
          </section>

          <section className="user-report-library__activity">
            <header>
              <span className="user-investments__panel-icon">
                <Icon name="activity" />
              </span>
              <div>
                <h2>{ar ? "النشاط الحديث" : "Recent activity"}</h2>
                <p>{ar ? "أحداث الحساب الموثقة" : "Audited account events"}</p>
              </div>
              <b>{reports.activity.length}</b>
            </header>
            <div className="user-report-library__list">
              {reports.activity.map((entry) => (
                <article key={entry.id}>
                  <div>
                    <strong>{entry.action}</strong>
                    <span>
                      {entry.entityType} ·{" "}
                      {new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(entry.createdAt)}
                    </span>
                  </div>
                </article>
              ))}
              {!reports.activity.length ? (
                <div className="user-report-library__empty">
                  <Icon name="activity" />
                  <strong>
                    {ar ? "لا توجد أحداث مدققة بعد" : "No audited activity yet"}
                  </strong>
                  <span>
                    {ar
                      ? "ستظهر العمليات المسجلة هنا."
                      : "Recorded actions will appear here."}
                  </span>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </PlatformShell>
  );
}
