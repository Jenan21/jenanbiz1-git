import Link from "next/link";
import { PrintButton } from "@/components/account/print-button";
import { UserCenterNav } from "@/components/account/user-center-nav";
import { UserSectionHeader } from "@/components/account/user-section-header";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getUserPayments } from "@/services/account/user-center-service";

export default async function UserInvoicePage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const [{ locale }, user, params] = await Promise.all([getRequestDictionary(), requireUser("/user/payments/invoice"), searchParams]);
  const payments = await getUserPayments(user.id);
  const payment = payments.find((item) => item.id === params.id) ?? payments[0];
  const ar = locale === "ar";
  const money = (minor: number, currency: string) => new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { style: "currency", currency }).format(minor / 100);
  return <PlatformShell locale={locale} activeRoute="/account" userLabel={user.profile?.displayName ?? user.email}><UserCenterNav activeRoute="/user/payments" locale={locale} /><section className="user-center-page user-invoice"><UserSectionHeader eyebrow={ar ? "فاتورة Jenan PRO" : "JENAN PRO INVOICE"} title={ar ? "تفاصيل الفاتورة" : "Invoice details"} description={ar ? "تفاصيل العملية المحفوظة دون تقدير ضريبة غير مسجلة." : "Persisted transaction details without estimating unrecorded tax."} action={payment ? <PrintButton label={ar ? "طباعة" : "Print"} /> : undefined} />{payment ? <article className="user-invoice__sheet"><header><strong>Jenan PRO</strong><span>{payment.externalRef ?? payment.id}</span></header><dl><div><dt>{ar ? "الخدمة" : "Service"}</dt><dd>{payment.subscription?.plan.name ?? payment.marketingCampaign?.name ?? payment.organization?.name ?? (ar ? "خدمة منصة" : "Platform service")}</dd></div><div><dt>{ar ? "الحالة" : "Status"}</dt><dd>{payment.status}</dd></div><div><dt>{ar ? "التاريخ" : "Date"}</dt><dd>{new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", { dateStyle: "medium" }).format(payment.paidAt ?? payment.createdAt)}</dd></div><div><dt>{ar ? "الضريبة" : "Tax"}</dt><dd>{ar ? "غير مسجلة" : "Not recorded"}</dd></div><div className="user-invoice__total"><dt>{ar ? "الإجمالي المسجل" : "Recorded total"}</dt><dd>{money(payment.amountMinor, payment.currency)}</dd></div></dl></article> : <section className="user-center-empty"><strong>{ar ? "لا توجد فاتورة متاحة" : "No invoice available"}</strong><p>{ar ? "لم يتم تسجيل عملية دفع يمكن عرضها." : "No payment has been recorded for display."}</p></section>}<Link className="button button--ghost" href="/user/payments">{ar ? "العودة إلى المدفوعات" : "Back to payments"}</Link></section></PlatformShell>;
}