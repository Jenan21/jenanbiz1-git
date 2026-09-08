"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Listing = {
  id: string;
  kind: "PROJECT" | "BUSINESS";
  status: "DRAFT" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
  title: string;
  summary: string;
  sector: string | null;
  countryCode: string | null;
  currency: string;
  createdById: string;
  isOwner: boolean;
  createdBy: { profile: { displayName: string | null } | null; email: string };
};
type Inquiry = {
  id: string;
  message: string;
  status: "NEW" | "CONTACTED" | "CLOSED";
  isListingOwner: boolean;
  listing: { id: string; title: string };
  requester: { email: string; profile: { displayName: string | null } | null };
};

export function MarketWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [listings, setListings] = useState<Listing[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [kind, setKind] = useState<Listing["kind"]>("PROJECT");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [sector, setSector] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [inquiryListingId, setInquiryListingId] = useState<string | null>(null);
  const [inquiryMessage, setInquiryMessage] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/market", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { listings?: Listing[]; inquiries?: Inquiry[]; message?: string } | null;
    if (response.ok && payload?.listings) { setListings(payload.listings); setInquiries(payload.inquiries ?? []); }
    else setMessage(payload?.message ?? (ar ? "تعذر تحميل السوق." : "The market could not be loaded."));
    setLoading(false);
  }

  const loadOnMount = useEffectEvent(() => { void load(); });

  useEffect(() => {
    const timeout = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function createListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", kind, title, summary, sector: sector || undefined, countryCode: countryCode || undefined }) });
    const payload = await response.json().catch(() => null) as { result?: Listing; message?: string } | null;
    if (response.ok && payload?.result) {
      setListings((current) => [payload.result!, ...current]);
      setTitle(""); setSummary(""); setSector(""); setCountryCode("");
      setMessage(ar ? "تم إنشاء الإدراج كمسودة. انشره عندما يصبح جاهزاً." : "Listing created as a draft. Publish it when ready.");
    } else setMessage(payload?.message ?? (ar ? "تعذر إنشاء الإدراج." : "The listing could not be created."));
    setSubmitting(false);
  }

  async function updateStatus(listingId: string, status: "PUBLISHED" | "PAUSED" | "ARCHIVED") {
    setMessage("");
    const response = await fetch("/api/market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateStatus", listingId, status }) });
    const payload = await response.json().catch(() => null) as { result?: Listing; message?: string } | null;
    if (response.ok && payload?.result) setListings((current) => current.map((listing) => listing.id === listingId ? payload.result! : listing));
    else setMessage(payload?.message ?? (ar ? "تعذر تحديث الإدراج." : "The listing could not be updated."));
  }

  async function createInquiry(event: FormEvent<HTMLFormElement>, listingId: string) {
    event.preventDefault();
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "createInquiry", listingId, message: inquiryMessage }) });
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    if (response.ok) { setInquiryListingId(null); setInquiryMessage(""); setMessage(ar ? "تم إرسال طلب الاهتمام لصاحب الإدراج." : "Your inquiry was sent to the listing owner."); await load(); }
    else setMessage(payload?.message ?? (ar ? "تعذر إرسال الطلب." : "The inquiry could not be sent."));
    setSubmitting(false);
  }

  async function updateInquiryStatus(inquiryId: string, status: "CONTACTED" | "CLOSED") {
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateInquiryStatus", inquiryId, status }) });
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    if (response.ok) await load(); else setMessage(payload?.message ?? (ar ? "تعذر تحديث الطلب." : "The inquiry could not be updated."));
    setSubmitting(false);
  }

  const visibleListings = listings.filter((listing) => `${listing.title} ${listing.summary} ${listing.sector ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="market-workspace" aria-busy={loading}>
    <header className="market-workspace__header"><div><span className="eyebrow eyebrow--small">JENAN MARKET</span><h1>{ar ? "سوق جنان للفرص" : "Jenan Market opportunities"}</h1><p>{ar ? "اعرض مشروعك أو نشاطك، ثم انشر الإدراج عند جاهزيته. لا توجد مدفوعات أو وساطة داخل المنصة." : "List a project or business and publish it when ready. The platform does not process payments or brokerage."}</p></div><button className="button button--secondary" onClick={() => void load()} type="button">{ar ? "تحديث" : "Refresh"}</button></header>
    <form className="market-form" onSubmit={createListing}><select aria-label={ar ? "نوع الإدراج" : "Listing type"} value={kind} onChange={(event) => setKind(event.target.value as Listing["kind"])}><option value="PROJECT">{ar ? "مشروع للبيع" : "Project for sale"}</option><option value="BUSINESS">{ar ? "نشاط للبيع" : "Business for sale"}</option></select><input required minLength={2} maxLength={160} placeholder={ar ? "عنوان الإدراج" : "Listing title"} value={title} onChange={(event) => setTitle(event.target.value)} /><input maxLength={120} placeholder={ar ? "القطاع" : "Sector"} value={sector} onChange={(event) => setSector(event.target.value)} /><input maxLength={2} placeholder={ar ? "الدولة" : "Country"} value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} /><textarea required minLength={20} maxLength={4000} placeholder={ar ? "ملخص واضح للفرصة" : "A clear opportunity summary"} value={summary} onChange={(event) => setSummary(event.target.value)} /><button className="button button--primary" disabled={submitting} type="submit">{submitting ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "إنشاء إدراج" : "Create listing")}</button></form>
    <input className="market-search" placeholder={ar ? "ابحث في الإدراجات المنشورة وإدراجاتك" : "Search published listings and your own"} value={query} onChange={(event) => setQuery(event.target.value)} />
    {message ? <p className="market-message" role="status">{message}</p> : null}
    <div className="market-listings">{loading ? <p className="market-message">{ar ? "جارٍ تحميل الإدراجات..." : "Loading listings..."}</p> : visibleListings.map((listing) => <article className="market-listing" key={listing.id}><div className="market-listing__meta"><span>{listing.kind === "PROJECT" ? (ar ? "مشروع" : "Project") : (ar ? "نشاط" : "Business")}</span><span>{listing.status}</span></div><h2>{listing.title}</h2><p>{listing.summary}</p><small>{[listing.sector, listing.countryCode].filter(Boolean).join(" · ") || (ar ? "بدون تصنيف إضافي" : "No additional classification")}</small>{listing.status !== "PUBLISHED" ? <button className="button button--secondary" onClick={() => void updateStatus(listing.id, "PUBLISHED")} type="button">{ar ? "نشر الإدراج" : "Publish listing"}</button> : listing.isOwner ? <button className="button button--ghost" onClick={() => void updateStatus(listing.id, "PAUSED")} type="button">{ar ? "إيقاف العرض" : "Pause listing"}</button> : inquiryListingId === listing.id ? <form className="market-inquiry-form" onSubmit={(event) => void createInquiry(event, listing.id)}><textarea required minLength={10} maxLength={2000} placeholder={ar ? "اكتب رسالة لصاحب الإدراج" : "Write a message to the listing owner"} value={inquiryMessage} onChange={(event) => setInquiryMessage(event.target.value)} /><button className="button button--primary" disabled={submitting} type="submit">{ar ? "إرسال الطلب" : "Send inquiry"}</button></form> : <button className="button button--primary" onClick={() => setInquiryListingId(listing.id)} type="button">{ar ? "طلب تواصل" : "Request contact"}</button>}</article>)}{!loading && !visibleListings.length ? <p className="market-message">{ar ? "لا توجد إدراجات مطابقة." : "No matching listings."}</p> : null}</div>
    {inquiries.some((inquiry) => inquiry.isListingOwner) ? <section className="market-inquiries"><h2>{ar ? "طلبات الاهتمام الواردة" : "Incoming inquiries"}</h2>{inquiries.filter((inquiry) => inquiry.isListingOwner).map((inquiry) => <article key={inquiry.id}><div><strong>{inquiry.listing.title}</strong><span>{inquiry.requester.profile?.displayName ?? inquiry.requester.email}</span><p>{inquiry.message}</p></div><div><strong>{inquiry.status}</strong>{inquiry.status === "NEW" ? <button className="button button--secondary" disabled={submitting} onClick={() => void updateInquiryStatus(inquiry.id, "CONTACTED")} type="button">{ar ? "تم التواصل" : "Mark contacted"}</button> : null}{inquiry.status !== "CLOSED" ? <button className="button button--ghost" disabled={submitting} onClick={() => void updateInquiryStatus(inquiry.id, "CLOSED")} type="button">{ar ? "إغلاق" : "Close"}</button> : null}</div></article>)}</section> : null}
  </section>;
}