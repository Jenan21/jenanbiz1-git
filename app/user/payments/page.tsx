import Link from "next/link";
import { UserCenterNav } from "@/components/account/user-center-nav";
import { UserSectionHeader } from "@/components/account/user-section-header";
import { PlatformShell } from "@/components/custom/platform-shell";
import { Icon, type IconName } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getUserPayments } from "@/services/account/user-center-service";

export default async function UserPaymentsPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/user/payments"),
  ]);
  const payments = await getUserPayments(user.id);
  const ar = locale === "ar";
  const money = (minor: number, currency: string) =>
    new Intl.NumberFormat(ar ? "ar-SA" : "en-US", {
      style: "currency",
      currency,
    }).format(minor / 100);
  const paidCount = payments.filter((payment) => payment.paidAt).length;
  const providerCount = new Set(payments.map((payment) => payment.provider))
    .size;
  const currencyCount = new Set(payments.map((payment) => payment.currency))
    .size;
  const summary: Array<[IconName, number, string]> = [
    ["wallet", payments.length, ar ? "المدفوعات" : "Payments"],
    ["check", paidCount, ar ? "إيصالات مكتملة" : "Completed receipts"],
    ["grid", providerCount, ar ? "طرق دفع مسجلة" : "Recorded methods"],
    ["globe", currencyCount, ar ? "عملات مستخدمة" : "Currencies used"],
  ];

  return (
    <PlatformShell
      locale={locale}
      activeRoute="/account"
      userLabel={user.profile?.displayName ?? user.email}
    >
      <UserCenterNav activeRoute="/user/payments" locale={locale} />
      <section className="user-center-page">
        <UserSectionHeader
          eyebrow={ar ? "السجل المالي" : "FINANCIAL RECORDS"}
          title={ar ? "المدفوعات والفواتير" : "Payments and invoices"}
          description={
            ar
              ? "سجل المدفوعات المحفوظة فعلياً فقط."
              : "Only payments actually persisted by the platform are shown."
          }
          action={
            <span className="user-finance__record-state">
              <Icon name="shield" />
              <span>
                <b>{ar ? "مصدر موثق" : "Verified source"}</b>
                <small>{ar ? "سجلات الحساب" : "Account records"}</small>
              </span>
            </span>
          }
        />
        <div className="user-finance__summary">
          {summary.map(([icon, value, label]) => (
            <article key={label}>
              <span className="user-investments__metric-icon">
                <Icon name={icon} />
              </span>
              <div>
                <strong>{value}</strong>
                <small>{label}</small>
              </div>
            </article>
          ))}
        </div>
        <section className="user-payments-panel">
          <header>
            <div>
              <span className="user-investments__panel-icon">
                <Icon name="wallet" />
              </span>
              <div>
                <h2>{ar ? "السجل" : "History"}</h2>
                <p>
                  {ar
                    ? "الفواتير والمدفوعات وطرق الدفع المسجلة"
                    : "Recorded invoices, payments, and payment methods"}
                </p>
              </div>
            </div>
            <span>
              {payments.length} {ar ? "سجل" : "records"}
            </span>
          </header>
          {payments.length ? (
            <div className="user-payments-table">
              <div className="user-payments-table__head">
                <span>{ar ? "المرجع" : "Reference"}</span>
                <span>{ar ? "الخدمة" : "Service"}</span>
                <span>{ar ? "طريقة الدفع" : "Method"}</span>
                <span>{ar ? "الحالة" : "Status"}</span>
                <span>{ar ? "الإجمالي" : "Total"}</span>
                <span />
              </div>
              {payments.map((payment) => (
                <article key={payment.id}>
                  <span>{payment.externalRef ?? payment.id.slice(0, 10)}</span>
                  <span>
                    {payment.subscription?.plan.name ??
                      payment.marketingCampaign?.name ??
                      payment.organization?.name ??
                      (ar ? "خدمة منصة" : "Platform service")}
                  </span>
                  <span>{payment.provider}</span>
                  <span className="user-payments-table__status">
                    {payment.status}
                  </span>
                  <strong>
                    {money(payment.amountMinor, payment.currency)}
                  </strong>
                  <Link
                    className="button button--ghost"
                    href={`/user/payments/invoice?id=${payment.id}`}
                  >
                    {ar ? "عرض" : "View"}
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="user-finance__empty">
              <Icon name="wallet" />
              <strong>
                {ar ? "لا توجد مدفوعات حتى الآن" : "No payments yet"}
              </strong>
              <p>
                {ar
                  ? "ستظهر الفواتير والإيصالات هنا بعد تسجيل عملية دفع فعلية."
                  : "Invoices and receipts appear here after a real payment is recorded."}
              </p>
              <button className="button button--ghost" disabled type="button">
                {ar ? "تنزيل إيصال" : "Download receipt"}
              </button>
            </div>
          )}
        </section>
      </section>
    </PlatformShell>
  );
}
