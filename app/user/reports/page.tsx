import Link from "next/link";
import { UserCenterNav } from "@/components/account/user-center-nav";
import { UserSectionHeader } from "@/components/account/user-section-header";
import { PlatformShell } from "@/components/custom/platform-shell";
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
        />
        <div className="user-report-grid">
          <section>
            <h2>{ar ? "تقارير المشاريع" : "Project reports"}</h2>
            {reports.projects.map((project) => (
              <article key={project.id}>
                <div>
                  <strong>{project.name}</strong>
                  <span>
                    {project.status} · {project.currentPhase}
                  </span>
                </div>
                <Link
                  className="button button--secondary"
                  href={`/reports/view/general?project=${project.id}`}
                >
                  {ar ? "فتح التقرير" : "Open report"}
                </Link>
              </article>
            ))}
            {!reports.projects.length ? (
              <p>
                {ar ? "لا توجد تقارير مشاريع بعد." : "No project reports yet."}
              </p>
            ) : null}
          </section>
          <section>
            <h2>{ar ? "النشاط الحديث" : "Recent activity"}</h2>
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
              <p>
                {ar ? "لا توجد أحداث مدققة بعد." : "No audited activity yet."}
              </p>
            ) : null}
          </section>
        </div>
        <Link className="button button--ghost" href="/user">
          {ar ? "مركز المستخدم" : "User center"}
        </Link>
      </section>
    </PlatformShell>
  );
}
