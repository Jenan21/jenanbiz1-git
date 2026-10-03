"use client";

import Link from "next/link";
import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Organization = { id: string; name: string; businessPrograms: Array<{ key: string; status: string }> };
type Entry = { id: string; type: "INCOME" | "EXPENSE"; amountMinor: number; currency: string; description: string; occurredAt: string };

export function FinancialLedgerWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [type, setType] = useState<Entry["type"]>("INCOME");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadOrganizations() {
    const response = await fetch("/api/programs", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { organizations?: Array<{ organization: Organization }>; message?: string } | null;
    if (!response.ok || !payload?.organizations) throw new Error(payload?.message ?? "Unable to load organizations");
    const nextOrganizations = payload.organizations.map(({ organization }) => organization).filter((organization) => organization.businessPrograms.some((program) => program.key === "FINANCE" && program.status === "ACTIVE"));
    setOrganizations(nextOrganizations);
    setOrganizationId((current) => nextOrganizations.some((organization) => organization.id === current) ? current : (nextOrganizations[0]?.id ?? ""));
    return nextOrganizations;
  }

  async function loadEntries(id: string) {
    if (!id) { setEntries([]); return; }
    const response = await fetch(`/api/programs/finance?organizationId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { entries?: Entry[]; message?: string } | null;
    if (response.ok && payload?.entries) setEntries(payload.entries);
    else setMessage(payload?.message ?? (ar ? "تعذر تحميل الدفتر." : "The ledger could not be loaded."));
  }

  const initializeLedger = useEffectEvent(() => {
    void (async () => {
      try { const nextOrganizations = await loadOrganizations(); await loadEntries(nextOrganizations[0]?.id ?? ""); }
      catch { setMessage(ar ? "تعذر تحميل المنشآت." : "Organizations could not be loaded."); }
      finally { setLoading(false); }
    })();
  });
  const loadSelectedEntries = useEffectEvent(() => { void loadEntries(organizationId); });

  useEffect(() => {
    const timeout = window.setTimeout(initializeLedger, 0);
    return () => window.clearTimeout(timeout);
  }, []);
  useEffect(() => {
    if (!organizationId) return;
    const timeout = window.setTimeout(loadSelectedEntries, 0);
    return () => window.clearTimeout(timeout);
  }, [organizationId]);

  async function createEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) { setMessage(ar ? "أدخل مبلغًا صحيحًا." : "Enter a valid amount."); return; }
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/programs/finance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, type, amountMinor: Math.round(numericAmount * 100), currency: "SAR", description, occurredAt: new Date().toISOString() }) });
    const payload = await response.json().catch(() => null) as { entry?: Entry; message?: string } | null;
    if (response.ok && payload?.entry) { setEntries((current) => [payload.entry!, ...current]); setAmount(""); setDescription(""); }
    else setMessage(payload?.message ?? (ar ? "تعذر تسجيل الحركة." : "The entry could not be recorded."));
    setSubmitting(false);
  }

  const income = entries.filter((entry) => entry.type === "INCOME").reduce((sum, entry) => sum + entry.amountMinor, 0);
  const expenses = entries.filter((entry) => entry.type === "EXPENSE").reduce((sum, entry) => sum + entry.amountMinor, 0);
  const formatAmount = (amountMinor: number) => new Intl.NumberFormat(ar ? "ar-SA" : "en-SA", { style: "currency", currency: "SAR" }).format(amountMinor / 100);

  return <section className="ledger-workspace" aria-busy={loading}>
    <header className="ledger-workspace__header"><div><span className="eyebrow eyebrow--small">FINANCE / LEDGER</span><h1>{ar ? "الدفتر المالي التشغيلي" : "Operational financial ledger"}</h1><p>{ar ? "سجّل الإيرادات والمصروفات الفعلية للمنشأة. الرصيد أدناه محسوب من السجلات فقط." : "Record actual organizational income and expenses. The balance below is calculated only from recorded entries."}</p></div><Link className="button button--secondary" href="/programs">{ar ? "برامج المنشأة" : "Organization programs"}</Link></header>
    {organizations.length ? <label className="ledger-organization">{ar ? "المنشأة" : "Organization"}<select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label> : <p className="programs-message">{ar ? "فعّل برنامج العمليات المالية أولًا من برامج المنشأة." : "Activate the financial operations program first."}</p>}
    {organizations.length ? <form className="ledger-form" onSubmit={createEntry}><select aria-label={ar ? "نوع الحركة" : "Entry type"} value={type} onChange={(event) => setType(event.target.value as Entry["type"])}><option value="INCOME">{ar ? "إيراد" : "Income"}</option><option value="EXPENSE">{ar ? "مصروف" : "Expense"}</option></select><input required inputMode="decimal" placeholder={ar ? "المبلغ بالريال" : "Amount in SAR"} value={amount} onChange={(event) => setAmount(event.target.value)} /><input required minLength={2} maxLength={1000} placeholder={ar ? "وصف الحركة" : "Entry description"} value={description} onChange={(event) => setDescription(event.target.value)} /><button className="button button--primary" disabled={submitting} type="submit">{submitting ? (ar ? "جارٍ التسجيل..." : "Recording...") : (ar ? "تسجيل حركة" : "Record entry")}</button></form> : null}
    {message ? <p className="programs-message" role="status">{message}</p> : null}
    <div className="ledger-summary"><article><span>{ar ? "الإيرادات" : "Income"}</span><strong>{formatAmount(income)}</strong></article><article><span>{ar ? "المصروفات" : "Expenses"}</span><strong>{formatAmount(expenses)}</strong></article><article><span>{ar ? "الرصيد" : "Balance"}</span><strong>{formatAmount(income - expenses)}</strong></article></div>
    <div className="ledger-entries">{entries.map((entry) => <article key={entry.id}><div><strong>{entry.type === "INCOME" ? (ar ? "إيراد" : "Income") : (ar ? "مصروف" : "Expense")}</strong><span>{entry.description}</span></div><div><strong>{formatAmount(entry.amountMinor)}</strong><small>{new Intl.DateTimeFormat(ar ? "ar-SA" : "en-SA", { dateStyle: "medium" }).format(new Date(entry.occurredAt))}</small></div></article>)}{!loading && !entries.length ? <p className="programs-message">{ar ? "لا توجد حركات مالية مسجلة." : "No financial entries have been recorded."}</p> : null}</div>
  </section>;
}