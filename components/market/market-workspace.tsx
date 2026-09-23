"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Listing = {
  id: string;
  askingPriceMinor: number | null;
  countryCode: string | null;
  createdBy: { email: string; profile: { displayName: string | null } | null };
  currency: string;
  isOwner: boolean;
  kind: "PROJECT" | "BUSINESS";
  qualityScore: number;
  sector: string | null;
  status: "DRAFT" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
  summary: string;
  title: string;
  valuationNote: string | null;
};
type Inquiry = {
  id: string;
  isListingOwner: boolean;
  listing: { id: string; title: string };
  message: string;
  requester: { email: string; profile: { displayName: string | null } | null };
  status: "NEW" | "CONTACTED" | "CLOSED";
};

function money(listing: Listing) {
  if (!listing.askingPriceMinor) return null;
  return new Intl.NumberFormat("en", { currency: listing.currency, maximumFractionDigits: 0, style: "currency" }).format(listing.askingPriceMinor / 100);
}

export function MarketWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [listings, setListings] = useState<Listing[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [form, setForm] = useState({ askingPrice: "", countryCode: "", kind: "PROJECT" as Listing["kind"], sector: "", summary: "", title: "", valuationNote: "" });
  const [filters, setFilters] = useState({ countryCode: "", kind: "", query: "", status: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [inquiryListingId, setInquiryListingId] = useState<string | null>(null);
  const [inquiryMessage, setInquiryMessage] = useState("");

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.query) params.set("search", filters.query);
    if (filters.kind) params.set("kind", filters.kind);
    if (filters.status) params.set("status", filters.status);
    if (filters.countryCode) params.set("countryCode", filters.countryCode);
    const response = await fetch(`/api/market?${params.toString()}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { inquiries?: Inquiry[]; listings?: Listing[]; message?: string } | null;
    if (response.ok && payload?.listings) {
      setListings(payload.listings);
      setInquiries(payload.inquiries ?? []);
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر تحميل السوق." : "The market could not be loaded."));
    }
    setLoading(false);
  }

  const loadOnMount = useEffectEvent(() => {
    void load();
  });

  useEffect(() => {
    const timeout = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function createListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const askingPriceMinor = form.askingPrice ? Math.round(Number(form.askingPrice) * 100) : undefined;
    const response = await fetch("/api/market", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create",
        askingPriceMinor,
        countryCode: form.countryCode || undefined,
        kind: form.kind,
        sector: form.sector || undefined,
        summary: form.summary,
        title: form.title,
        valuationNote: form.valuationNote || undefined,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string; result?: Listing } | null;
    if (response.ok && payload?.result) {
      setListings((current) => [payload.result!, ...current]);
      setForm({ askingPrice: "", countryCode: "", kind: "PROJECT", sector: "", summary: "", title: "", valuationNote: "" });
      setMessage(ar ? "تم إنشاء الإدراج مع درجة جودة أولية." : "Listing created with an initial quality score.");
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر إنشاء الإدراج." : "The listing could not be created."));
    }
    setSubmitting(false);
  }

  async function updateStatus(listingId: string, status: "PUBLISHED" | "PAUSED" | "ARCHIVED") {
    setMessage("");
    const response = await fetch("/api/market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateStatus", listingId, status }) });
    const payload = (await response.json().catch(() => null)) as { message?: string; result?: Listing } | null;
    if (response.ok && payload?.result) setListings((current) => current.map((listing) => listing.id === listingId ? payload.result! : listing));
    else setMessage(payload?.message ?? (ar ? "تعذر تحديث الإدراج." : "The listing could not be updated."));
  }

  async function createInquiry(event: FormEvent<HTMLFormElement>, listingId: string) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "createInquiry", listingId, message: inquiryMessage }) });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.ok) {
      setInquiryListingId(null);
      setInquiryMessage("");
      setMessage(ar ? "تم إرسال طلب الاهتمام لصاحب الإدراج." : "Your inquiry was sent to the listing owner.");
      await load();
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر إرسال الطلب." : "The inquiry could not be sent."));
    }
    setSubmitting(false);
  }

  async function updateInquiryStatus(inquiryId: string, status: "CONTACTED" | "CLOSED") {
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateInquiryStatus", inquiryId, status }) });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.ok) await load(); else setMessage(payload?.message ?? (ar ? "تعذر تحديث الطلب." : "The inquiry could not be updated."));
    setSubmitting(false);
  }

  const ownerInquiries = inquiries.filter((inquiry) => inquiry.isListingOwner);

  return (
    <section className="market-workspace" aria-busy={loading}>
      <header className="market-workspace__header">
        <div>
          <span className="eyebrow eyebrow--small">JENAN MARKET</span>
          <h1>{ar ? "سوق جنان للفرص" : "Jenan Market opportunities"}</h1>
          <p>{ar ? "سوق فرص موثّق بدرجة جودة، سعر معلن، وطلبات اهتمام قابلة للمتابعة." : "A quality-scored opportunity market with pricing, discovery filters, and trackable buyer interest."}</p>
        </div>
        <button className="button button--secondary" onClick={() => void load()} type="button">{ar ? "تحديث" : "Refresh"}</button>
      </header>

      <form className="market-form" onSubmit={createListing}>
        <select aria-label={ar ? "نوع الإدراج" : "Listing type"} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as Listing["kind"] })}>
          <option value="PROJECT">{ar ? "مشروع للبيع" : "Project for sale"}</option>
          <option value="BUSINESS">{ar ? "نشاط للبيع" : "Business for sale"}</option>
        </select>
        <input required minLength={2} maxLength={160} placeholder={ar ? "عنوان الإدراج" : "Listing title"} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <input maxLength={120} placeholder={ar ? "القطاع" : "Sector"} value={form.sector} onChange={(event) => setForm({ ...form, sector: event.target.value })} />
        <input maxLength={2} placeholder={ar ? "الدولة" : "Country"} value={form.countryCode} onChange={(event) => setForm({ ...form, countryCode: event.target.value.toUpperCase() })} />
        <input min="1" placeholder={ar ? "السعر المطلوب" : "Asking price"} type="number" value={form.askingPrice} onChange={(event) => setForm({ ...form, askingPrice: event.target.value })} />
        <textarea required minLength={20} maxLength={4000} placeholder={ar ? "ملخص واضح للفرصة" : "A clear opportunity summary"} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
        <textarea maxLength={1000} placeholder={ar ? "ملاحظة تقييم أو مبرر السعر" : "Valuation note or price rationale"} value={form.valuationNote} onChange={(event) => setForm({ ...form, valuationNote: event.target.value })} />
        <button className="button button--primary" disabled={submitting} type="submit">{submitting ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "إنشاء إدراج" : "Create listing")}</button>
      </form>

      <div className="market-filters">
        <input placeholder={ar ? "بحث" : "Search"} value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
        <select value={filters.kind} onChange={(event) => setFilters({ ...filters, kind: event.target.value })}><option value="">{ar ? "كل الأنواع" : "All kinds"}</option><option value="PROJECT">{ar ? "مشاريع" : "Projects"}</option><option value="BUSINESS">{ar ? "أنشطة" : "Businesses"}</option></select>
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">{ar ? "كل الحالات" : "All statuses"}</option><option value="PUBLISHED">PUBLISHED</option><option value="DRAFT">DRAFT</option><option value="PAUSED">PAUSED</option></select>
        <input maxLength={2} placeholder={ar ? "الدولة" : "Country"} value={filters.countryCode} onChange={(event) => setFilters({ ...filters, countryCode: event.target.value.toUpperCase() })} />
        <button className="button button--secondary" onClick={() => void load()} type="button">{ar ? "تطبيق" : "Apply"}</button>
      </div>

      {message ? <p className="market-message" role="status">{message}</p> : null}

      <div className="market-listings">
        {loading ? <p className="market-message">{ar ? "جارٍ تحميل الإدراجات..." : "Loading listings..."}</p> : null}
        {!loading && listings.map((listing) => (
          <article className="market-listing" key={listing.id}>
            <div className="market-listing__meta"><span>{listing.kind === "PROJECT" ? (ar ? "مشروع" : "Project") : (ar ? "نشاط" : "Business")}</span><span>{listing.status}</span><span>{ar ? "جودة" : "Quality"}: {listing.qualityScore}/100</span></div>
            <h2>{listing.title}</h2>
            <p>{listing.summary}</p>
            <small>{[listing.sector, listing.countryCode, money(listing)].filter(Boolean).join(" · ") || (ar ? "بدون تصنيف إضافي" : "No additional classification")}</small>
            {listing.valuationNote ? <blockquote>{listing.valuationNote}</blockquote> : null}
            {listing.status !== "PUBLISHED" && listing.isOwner ? <button className="button button--secondary" onClick={() => void updateStatus(listing.id, "PUBLISHED")} type="button">{ar ? "نشر الإدراج" : "Publish listing"}</button> : null}
            {listing.status === "PUBLISHED" && listing.isOwner ? <button className="button button--ghost" onClick={() => void updateStatus(listing.id, "PAUSED")} type="button">{ar ? "إيقاف العرض" : "Pause listing"}</button> : null}
            {listing.status === "PUBLISHED" && !listing.isOwner && (inquiryListingId === listing.id ? <form className="market-inquiry-form" onSubmit={(event) => void createInquiry(event, listing.id)}><textarea required minLength={10} maxLength={2000} placeholder={ar ? "اكتب رسالة لصاحب الإدراج" : "Write a message to the listing owner"} value={inquiryMessage} onChange={(event) => setInquiryMessage(event.target.value)} /><button className="button button--primary" disabled={submitting} type="submit">{ar ? "إرسال الطلب" : "Send inquiry"}</button></form> : <button className="button button--primary" onClick={() => setInquiryListingId(listing.id)} type="button">{ar ? "طلب تواصل" : "Request contact"}</button>)}
          </article>
        ))}
        {!loading && !listings.length ? <p className="market-message">{ar ? "لا توجد إدراجات مطابقة." : "No matching listings."}</p> : null}
      </div>

      {ownerInquiries.length ? <section className="market-inquiries"><h2>{ar ? "طلبات الاهتمام الواردة" : "Incoming inquiries"}</h2>{ownerInquiries.map((inquiry) => <article key={inquiry.id}><div><strong>{inquiry.listing.title}</strong><span>{inquiry.requester.profile?.displayName ?? inquiry.requester.email}</span><p>{inquiry.message}</p></div><div><strong>{inquiry.status}</strong>{inquiry.status === "NEW" ? <button className="button button--secondary" disabled={submitting} onClick={() => void updateInquiryStatus(inquiry.id, "CONTACTED")} type="button">{ar ? "تم التواصل" : "Mark contacted"}</button> : null}{inquiry.status !== "CLOSED" ? <button className="button button--ghost" disabled={submitting} onClick={() => void updateInquiryStatus(inquiry.id, "CLOSED")} type="button">{ar ? "إغلاق" : "Close"}</button> : null}</div></article>)}</section> : null}
    </section>
  );
}