import Link from "next/link";
import { UserCenterNav } from "@/components/account/user-center-nav";
import { UserSectionHeader } from "@/components/account/user-section-header";
import { PlatformShell } from "@/components/custom/platform-shell";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function InvestmentDetailPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/user/investment/detail"),
  ]);
  const ar = locale === "ar";
  return (
    <PlatformShell
      locale={locale}
      activeRoute="/account"
      userLabel={user.profile?.displayName ?? user.email}
    >
      <UserCenterNav activeRoute="/user/investments" locale={locale} />
      <section className="user-center-page">
        <UserSectionHeader
          eyebrow={ar ? "تفاصيل الاستثمار" : "INVESTMENT DETAIL"}
          title={ar ? "تفاصيل الأصل" : "Asset details"}
          description={
            ar
              ? "تظهر التفاصيل بعد اختيار استثمار موثق من مصدر متصل."
              : "Details appear after selecting a verified investment from a connected source."
          }
          action={
            <span className="user-investments__source">
              <Icon name="lock" />
              <span>
                <b>{ar ? "حالة السجل" : "Record status"}</b>
                <small>
                  {ar ? "لا يوجد استثمار محدد" : "No investment selected"}
                </small>
              </span>
            </span>
          }
        />
        <div className="user-investment-detail">
          <section className="user-investments__panel user-investment-detail__asset">
            <header>
              <div>
                <span className="user-investments__panel-icon">
                  <Icon name="briefcase" />
                </span>
                <div>
                  <h2>{ar ? "بيانات الأصل" : "Asset data"}</h2>
                  <p>
                    {ar
                      ? "الهوية والتصنيف ومصدر التقييم"
                      : "Identity, classification, and valuation source"}
                  </p>
                </div>
              </div>
              <span className="user-investments__state">
                {ar ? "غير متوفر" : "Unavailable"}
              </span>
            </header>
            <dl className="user-investment-detail__facts">
              {[
                [ar ? "اسم الأصل" : "Asset name", "—"],
                [
                  ar ? "الفئة" : "Asset class",
                  ar ? "غير مصنف" : "Unclassified",
                ],
                [
                  ar ? "مصدر البيانات" : "Data source",
                  ar ? "غير متصل" : "Not connected",
                ],
                [
                  ar ? "تاريخ التقييم" : "Valuation date",
                  ar ? "لا يوجد" : "None",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="user-investments__panel user-investment-detail__return">
            <header>
              <div>
                <span className="user-investments__panel-icon">
                  <Icon name="trend" />
                </span>
                <div>
                  <h2>{ar ? "العائد" : "Return"}</h2>
                  <p>
                    {ar
                      ? "محسوب من سجل فعلي فقط"
                      : "Calculated only from persisted records"}
                  </p>
                </div>
              </div>
            </header>
            <div className="user-investment-detail__metric">
              <strong>—</strong>
              <span>{ar ? "لا أساس للحساب" : "No calculation basis"}</span>
            </div>
          </section>

          <section className="user-investments__panel user-investments__performance user-investment-detail__performance">
            <header>
              <div>
                <span className="user-investments__panel-icon">
                  <Icon name="barChart" />
                </span>
                <div>
                  <h2>{ar ? "الأداء الزمني" : "Performance timeline"}</h2>
                  <p>
                    {ar ? "تاريخ القيمة والعائد" : "Value and return history"}
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
                <Icon name="activity" />
                <strong>
                  {ar
                    ? "لا يوجد سجل زمني لهذا الاستثمار"
                    : "No timeline exists for this investment"}
                </strong>
                <span>
                  {ar
                    ? "سيظهر الأداء بعد اختيار أصل موثق."
                    : "Performance appears after a verified asset is selected."}
                </span>
              </div>
            </div>
          </section>

          <section className="user-investments__panel user-investment-detail__updates">
            <header>
              <div>
                <span className="user-investments__panel-icon">
                  <Icon name="bell" />
                </span>
                <div>
                  <h2>{ar ? "التحديثات" : "Updates"}</h2>
                  <p>{ar ? "الأحداث الموثقة" : "Verified events"}</p>
                </div>
              </div>
            </header>
            <div className="user-investments__compact-empty">
              <Icon name="activity" />
              <div>
                <strong>{ar ? "لا توجد أحداث" : "No events"}</strong>
                <span>
                  {ar
                    ? "لا يظهر أي تحديث دون سجل استثماري فعلي."
                    : "No update is shown without a real investment record."}
                </span>
              </div>
            </div>
          </section>

          <section className="user-investments__panel user-investment-detail__documents">
            <header>
              <div>
                <span className="user-investments__panel-icon">
                  <Icon name="shield" />
                </span>
                <div>
                  <h2>{ar ? "المستندات" : "Documents"}</h2>
                  <p>
                    {ar ? "ملفات الأصل المصرح بها" : "Authorized asset files"}
                  </p>
                </div>
              </div>
            </header>
            <div className="user-investments__compact-empty">
              <Icon name="lock" />
              <div>
                <strong>
                  {ar ? "لا توجد مستندات متاحة" : "No documents available"}
                </strong>
                <span>
                  {ar
                    ? "ستظهر الملفات بعد التحقق من صلاحية الوصول."
                    : "Files appear after access is verified."}
                </span>
              </div>
            </div>
          </section>

          <section className="user-investments__report user-investment-detail__report">
            <span className="user-investments__report-icon">
              <Icon name="barChart" />
            </span>
            <div>
              <span>{ar ? "المخرجات" : "OUTPUTS"}</span>
              <h2>{ar ? "تقرير الاستثمار" : "Investment report"}</h2>
              <p>
                {ar
                  ? "الطباعة والتصدير والمشاركة تتطلب سجلاً فعليًا محددًا."
                  : "Print, export, and sharing require a selected real record."}
              </p>
            </div>
            <div className="user-investments__actions">
              <Link
                className="button button--secondary"
                href="/user/investments"
              >
                {ar ? "العودة" : "Back"}
              </Link>
              <Link
                className="button button--ghost"
                href="/reports/view/investment"
              >
                {ar ? "حالة التقرير" : "Report state"}
              </Link>
              <button className="button button--ghost" disabled type="button">
                {ar ? "طباعة" : "Print"}
              </button>
              <button className="button button--ghost" disabled type="button">
                PDF
              </button>
              <button className="button button--ghost" disabled type="button">
                {ar ? "مشاركة" : "Share"}
              </button>
              <button className="button button--ghost" disabled type="button">
                {ar ? "بريد" : "Email"}
              </button>
            </div>
          </section>
        </div>
      </section>
    </PlatformShell>
  );
}
