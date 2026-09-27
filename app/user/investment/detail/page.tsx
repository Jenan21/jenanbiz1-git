import Link from "next/link";
import { UserCenterNav } from "@/components/account/user-center-nav";
import { UserSectionHeader } from "@/components/account/user-section-header";
import { PlatformShell } from "@/components/custom/platform-shell";
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
        />
        <div className="user-center-detail-grid">
          {[
            ar ? "بيانات الأصل" : "Asset data",
            ar ? "العائد" : "Return",
            ar ? "الأداء الزمني" : "Timeline",
            ar ? "المستندات" : "Documents",
          ].map((label) => (
            <article key={label}>
              <strong>{label}</strong>
              <span>{ar ? "غير متوفر" : "Unavailable"}</span>
              <small>{ar ? "بانتظار المصدر" : "Awaiting source"}</small>
            </article>
          ))}
        </div>
        <section className="user-center-empty">
          <p>
            {ar
              ? "لا يمكن الطباعة أو التصدير أو المشاركة قبل توفر سجل استثماري فعلي."
              : "Print, export, and sharing remain unavailable until a real investment record exists."}
          </p>
          <Link className="button button--secondary" href="/user/investments">
            {ar ? "العودة إلى الاستثمارات" : "Back to investments"}
          </Link>
          <Link className="button button--ghost" href="/reports/view/investment">
            {ar ? "فتح تقرير الاستثمار" : "Open investment report"}
          </Link>
        </section>
      </section>
    </PlatformShell>
  );
}
