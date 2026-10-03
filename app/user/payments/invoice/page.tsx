import Link from "next/link";
import { PrintButton } from "@/components/account/print-button";
import { UserCenterNav } from "@/components/account/user-center-nav";
import { UserSectionHeader } from "@/components/account/user-section-header";
import { PlatformShell } from "@/components/custom/platform-shell";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getUserPayments } from "@/services/account/user-center-service";

export default async function UserInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const [{ locale }, user, params] = await Promise.all([
    getRequestDictionary(),
    requireUser("/user/payments/invoice"),
    searchParams,
  ]);
  const payments = await getUserPayments(user.id);
  const payment = payments.find((item) => item.id === params.id) ?? payments[0];
  const ar = locale === "ar";
  const money = (minor: number, currency: string) =>
    new Intl.NumberFormat(ar ? "ar-SA" : "en-US", {
      style: "currency",
      currency,
    }).format(minor / 100);
  const service =
    payment?.subscription?.plan.name ??
    payment?.marketingCampaign?.name ??
    payment?.organization?.name ??
    (payment ? (ar ? "خدمة منصة" : "Platform service") : "—");
  const invoiceReference = payment?.externalRef ?? payment?.id ?? "—";
  const invoiceDate = payment
    ? new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", {
        dateStyle: "medium",
      }).format(payment.paidAt ?? payment.createdAt)
    : "—";

  return (
    <PlatformShell
      locale={locale}
      activeRoute="/account"
      userLabel={user.profile?.displayName ?? user.email}
    >
      <UserCenterNav activeRoute="/user/payments" locale={locale} />
      <section className="user-center-page user-invoice">
        <UserSectionHeader
          eyebrow={ar ? "فاتورة Jenan PRO" : "JENAN PRO INVOICE"}
          title={ar ? "تفاصيل الفاتورة" : "Invoice details"}
          description={
            ar
              ? "تفاصيل العملية المحفوظة دون تقدير ضريبة غير مسجلة."
              : "Persisted transaction details without estimating unrecorded tax."
          }
          action={
            <span className="user-finance__record-state">
              <Icon name={payment ? "check" : "lock"} />
              <span>
                <b>{ar ? "حالة الفاتورة" : "Invoice status"}</b>
                <small>
                  {payment?.status ?? (ar ? "غير متوفرة" : "Unavailable")}
                </small>
              </span>
            </span>
          }
        />
        <article className={`user-invoice__sheet${payment ? "" : " is-empty"}`}>
          <header>
            <div>
              <strong>
                Jenan <b>PRO</b>
              </strong>
              <small>
                {ar ? "فاتورة منصة الأعمال" : "Business platform invoice"}
              </small>
            </div>
            <div>
              <span>{ar ? "رقم الفاتورة" : "Invoice number"}</span>
              <strong>{invoiceReference}</strong>
            </div>
          </header>
          <div className="user-invoice__meta">
            <div>
              <span>{ar ? "التاريخ" : "Date"}</span>
              <strong>{invoiceDate}</strong>
            </div>
            <div>
              <span>{ar ? "الحالة" : "Status"}</span>
              <strong>{payment?.status ?? "—"}</strong>
            </div>
            <div>
              <span>{ar ? "العملة" : "Currency"}</span>
              <strong>{payment?.currency ?? "—"}</strong>
            </div>
          </div>
          <section className="user-invoice__items">
            <header>
              <span>{ar ? "البند" : "Item"}</span>
              <span>{ar ? "الكمية" : "Quantity"}</span>
              <span>{ar ? "القيمة" : "Amount"}</span>
            </header>
            <div>
              <strong>{service}</strong>
              <span>{payment ? "1" : "—"}</span>
              <strong>
                {payment ? money(payment.amountMinor, payment.currency) : "—"}
              </strong>
            </div>
          </section>
          <dl>
            <div>
              <dt>{ar ? "الضريبة" : "Tax"}</dt>
              <dd>{ar ? "غير مسجلة" : "Not recorded"}</dd>
            </div>
            <div className="user-invoice__total">
              <dt>{ar ? "الإجمالي المسجل" : "Recorded total"}</dt>
              <dd>
                {payment ? money(payment.amountMinor, payment.currency) : "—"}
              </dd>
            </div>
          </dl>
          {!payment ? (
            <div className="user-invoice__notice">
              <Icon name="shield" />
              <span>
                <strong>
                  {ar ? "لا توجد فاتورة متاحة" : "No invoice available"}
                </strong>
                <small>
                  {ar
                    ? "لم يتم تسجيل عملية دفع يمكن عرضها."
                    : "No payment has been recorded for display."}
                </small>
              </span>
            </div>
          ) : null}
        </article>
        <div className="user-invoice__outputs">
          <Link className="button button--ghost" href="/user/payments">
            {ar ? "العودة إلى المدفوعات" : "Back to payments"}
          </Link>
          {payment ? (
            <PrintButton label={ar ? "طباعة" : "Print"} />
          ) : (
            <button className="button button--secondary" disabled type="button">
              {ar ? "طباعة" : "Print"}
            </button>
          )}
          <button className="button button--ghost" disabled type="button">
            PDF
          </button>
          <button className="button button--ghost" disabled type="button">
            {ar ? "إرسال بالبريد" : "Send by email"}
          </button>
        </div>
      </section>
    </PlatformShell>
  );
}
