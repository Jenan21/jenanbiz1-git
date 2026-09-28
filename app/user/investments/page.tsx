import Link from "next/link";
import { UserCenterNav } from "@/components/account/user-center-nav";
import { UserSectionHeader } from "@/components/account/user-section-header";
import { PlatformShell } from "@/components/custom/platform-shell";
import { Icon, type IconName } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function UserInvestmentsPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/user/investments"),
  ]);
  const ar = locale === "ar";
  const metrics: { icon: IconName; label: string; note: string }[] = [
    {
      icon: "wallet",
      label: ar ? "إجمالي الاستثمارات" : "Total investments",
      note: ar ? "لا سجلات مرتبطة" : "No linked records",
    },
    {
      icon: "trend",
      label: ar ? "العائد" : "Return",
      note: ar ? "لا أساس للحساب" : "No calculation basis",
    },
    {
      icon: "barChart",
      label: ar ? "القيمة السوقية" : "Market value",
      note: ar ? "لا تقييمات موثقة" : "No verified valuations",
    },
    {
      icon: "pieChart",
      label: ar ? "توزيع المحفظة" : "Portfolio allocation",
      note: ar ? "لا أصول مصنفة" : "No classified assets",
    },
  ];

  return (
    <PlatformShell
      locale={locale}
      activeRoute="/account"
      userLabel={user.profile?.displayName ?? user.email}
    >
      <UserCenterNav activeRoute="/user/investments" locale={locale} />
      <section className="user-center-page">
        <UserSectionHeader
          eyebrow={ar ? "المحفظة الاستثمارية" : "INVESTMENT PORTFOLIO"}
          title={ar ? "بياناتي الاستثمارية" : "My investment data"}
          description={
            ar
              ? "تظهر الأصول والعوائد فقط عند ربط مصدر استثماري معتمد."
              : "Assets and returns appear only after an approved investment data source is connected."
          }
          action={
            <span className="user-investments__source">
              <Icon name="lock" />
              <span>
                <b>{ar ? "مصدر البيانات" : "Data source"}</b>
                <small>{ar ? "غير متصل" : "Not connected"}</small>
              </span>
            </span>
          }
        />
        <div className="user-center-metrics user-investments__metrics">
          {metrics.map((metric) => (
            <article key={metric.label}>
              <header>
                <span className="user-investments__metric-icon">
                  <Icon name={metric.icon} />
                </span>
                <span>{metric.label}</span>
              </header>
              <strong>—</strong>
              <footer>
                <small>{ar ? "غير متوفر" : "Unavailable"}</small>
                <span>{metric.note}</span>
              </footer>
            </article>
          ))}
        </div>
        <div className="user-investments__workspace">
          <section className="user-investments__panel user-investments__performance">
            <header>
              <div>
                <span className="user-investments__panel-icon">
                  <Icon name="trend" />
                </span>
                <div>
                  <h2>{ar ? "الأداء الزمني" : "Performance timeline"}</h2>
                  <p>
                    {ar
                      ? "تغيّر قيمة المحفظة عبر الفترات"
                      : "Portfolio value movement over time"}
                  </p>
                </div>
              </div>
              <span className="user-investments__state">
                {ar ? "بانتظار المصدر" : "Awaiting source"}
              </span>
            </header>
            <div className="user-investments__chart">
              <div
                className="user-investments__chart-grid"
                aria-hidden="true"
              />
              <div className="user-investments__chart-empty">
                <Icon name="barChart" />
                <strong>
                  {ar
                    ? "لا توجد نقاط أداء قابلة للعرض"
                    : "No performance points to display"}
                </strong>
                <span>
                  {ar
                    ? "سيظهر المخطط بعد وصول سجل تقييم موثق."
                    : "The chart will appear after a verified valuation history is available."}
                </span>
              </div>
            </div>
            <footer>
              <span>{ar ? "الفترة: غير متوفرة" : "Period: unavailable"}</span>
              <span>{ar ? "آخر تحديث: لا يوجد" : "Last update: none"}</span>
            </footer>
          </section>

          <section className="user-investments__panel user-investments__allocation">
            <header>
              <div>
                <span className="user-investments__panel-icon">
                  <Icon name="pieChart" />
                </span>
                <div>
                  <h2>{ar ? "توزيع المحفظة" : "Portfolio allocation"}</h2>
                  <p>{ar ? "حسب فئة الأصل" : "By asset class"}</p>
                </div>
              </div>
            </header>
            <div className="user-investments__allocation-empty">
              <div className="user-investments__allocation-ring">
                <Icon name="pieChart" />
                <strong>—</strong>
              </div>
              <strong>
                {ar ? "لا توجد أصول مصنفة" : "No classified assets"}
              </strong>
              <span>{ar ? "غير متوفر" : "Unavailable"}</span>
            </div>
          </section>

          <section className="user-investments__panel user-investments__opportunities">
            <header>
              <div>
                <span className="user-investments__panel-icon">
                  <Icon name="rocket" />
                </span>
                <div>
                  <h2>{ar ? "الفرص" : "Opportunities"}</h2>
                  <p>
                    {ar
                      ? "فرص مرتبطة بمحفظتك"
                      : "Opportunities matched to your portfolio"}
                  </p>
                </div>
              </div>
            </header>
            <div className="user-investments__compact-empty">
              <Icon name="shield" />
              <div>
                <strong>
                  {ar
                    ? "لا توصيات دون بيانات فعلية"
                    : "No recommendations without real data"}
                </strong>
                <span>
                  {ar
                    ? "لن تُنشأ اقتراحات تقديرية قبل ربط المحفظة."
                    : "Estimated suggestions will not be created before the portfolio is connected."}
                </span>
              </div>
            </div>
          </section>

          <section className="user-investments__panel user-investments__updates">
            <header>
              <div>
                <span className="user-investments__panel-icon">
                  <Icon name="bell" />
                </span>
                <div>
                  <h2>{ar ? "التحديثات" : "Updates"}</h2>
                  <p>
                    {ar
                      ? "أحداث الأصول والمستندات"
                      : "Asset and document events"}
                  </p>
                </div>
              </div>
            </header>
            <div className="user-investments__compact-empty">
              <Icon name="activity" />
              <div>
                <strong>
                  {ar ? "لا توجد تحديثات موثقة" : "No verified updates"}
                </strong>
                <span>
                  {ar
                    ? "ستظهر هنا الأحداث الواردة من المصدر المعتمد."
                    : "Events from the approved source will appear here."}
                </span>
              </div>
            </div>
          </section>

          <section className="user-investments__report">
            <span className="user-investments__report-icon">
              <Icon name="barChart" />
            </span>
            <div>
              <span>{ar ? "المخرجات" : "OUTPUTS"}</span>
              <h2>{ar ? "تقرير المحفظة" : "Portfolio report"}</h2>
              <p>
                {ar
                  ? "حالة تقرير صادقة تعرض عدم توفر البيانات حتى اتصال المصدر."
                  : "A truthful report state that remains unavailable until the source is connected."}
              </p>
            </div>
            <div className="user-investments__actions">
              <Link
                className="button button--secondary"
                href="/user/investment/detail"
              >
                {ar ? "عرض التفاصيل" : "View details"}
              </Link>
              <Link
                className="button button--ghost"
                href="/reports/view/portfolio"
              >
                {ar ? "فتح التقرير" : "Open report"}
              </Link>
              <button
                className="button button--ghost user-investments__export"
                disabled
                type="button"
              >
                {ar ? "تصدير" : "Export"}
              </button>
            </div>
          </section>
        </div>
      </section>
    </PlatformShell>
  );
}
