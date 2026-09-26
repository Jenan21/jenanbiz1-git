import Link from "next/link";
import { UserCenterNav } from "@/components/account/user-center-nav";
import { UserSectionHeader } from "@/components/account/user-section-header";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getUserPayments } from "@/services/account/user-center-service";

export default async function UserPaymentsPage() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/user/payments")]);
  const payments = await getUserPayments(user.id);
  const ar = locale === "ar";
  const money = (minor: number, currency: string) => new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { style: "currency", currency }).format(minor / 100);
  return <PlatformShell locale={locale} activeRoute="/account" userLabel={user.profile?.displayName ?? user.email}><UserCenterNav activeRoute="/user/payments" locale={locale} /><section className="user-center-page"><UserSectionHeader eyebrow={ar ? "السجل المالي" : "FINANCIAL RECORDS"} title={ar ? "المدفوعات والفواتير" : "Payments and invoices"} description={ar ? "سجل المدفوعات المحفوظة فعلياً فقط." : "Only payments actually persisted by the platform are shown."} />{payments.length ? <div className="user-payments-table"><div className="user-payments-table__head"><span>{ar ? "المرجع" : "Reference"}</span><span>{ar ? "الخدمة" : "Service"}</span><span>{ar ? "الحالة" : "Status"}</span><span>{ar ? "الإجمالي" : "Total"}</span><span /></div>{payments.map((payment) => <article key={payment.id}><span>{payment.externalRef ?? payment.id.slice(0, 10)}</span><span>{payment.subscription?.plan.name ?? payment.marketingCampaign?.name ?? payment.organization?.name ?? (ar ? "خدمة منصة" : "Platform service")}</span><span>{payment.status}</span><strong>{money(payment.amountMinor, payment.currency)}</strong><Link href={`/user/payments/invoice?id=${payment.id}`}>{ar ? "عرض" : "View"}</Link></article>)}</div> : <section className="user-center-empty"><strong>{ar ? "لا توجد مدفوعات حتى الآن" : "No payments yet"}</strong><p>{ar ? "ستظهر الفواتير والإيصالات هنا بعد تسجيل عملية دفع فعلية." : "Invoices and receipts appear here after a real payment is recorded."}</p></section>}</section></PlatformShell>;
}