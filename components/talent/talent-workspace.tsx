"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Posting = {
  id: string;
  createdById: string;
  title: string;
  description: string;
  department: string | null;
  countryCode: string | null;
  city: string | null;
  workMode: "ON_SITE" | "HYBRID" | "REMOTE";
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  createdBy: { email: string; profile: { displayName: string | null } | null };
  applications: Array<{ applicantId: string; status: string }>;
};
type OwnedApplication = {
  id: string;
  message: string | null;
  status: "SUBMITTED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  jobPosting: { id: string; title: string };
  applicant: { email: string; profile: { displayName: string | null } | null };
};

export function TalentWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [postings, setPostings] = useState<Posting[]>([]);
  const [ownedApplications, setOwnedApplications] = useState<OwnedApplication[]>([]);
  const [viewerId, setViewerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [city, setCity] = useState("");
  const [workMode, setWorkMode] = useState<Posting["workMode"]>("ON_SITE");
  const [query, setQuery] = useState("");
  const [applicationTarget, setApplicationTarget] = useState<string | null>(null);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/talent", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { viewerId?: string; postings?: Posting[]; applications?: OwnedApplication[]; message?: string } | null;
    if (response.ok && payload?.postings && payload.viewerId) {
      setPostings(payload.postings);
      setOwnedApplications(payload.applications ?? []);
      setViewerId(payload.viewerId);
    } else setMessage(payload?.message ?? (ar ? "تعذر تحميل الوظائف." : "Jobs could not be loaded."));
    setLoading(false);
  }

  const loadOnMount = useEffectEvent(() => { void load(); });

  useEffect(() => {
    const timeout = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function createPosting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/talent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", title, description, department: department || undefined, countryCode: countryCode || undefined, city: city || undefined, workMode }) });
    const payload = await response.json().catch(() => null) as { result?: Posting; message?: string } | null;
    if (response.ok && payload?.result) {
      setPostings((current) => [payload.result!, ...current]);
      setTitle(""); setDescription(""); setDepartment(""); setCountryCode(""); setCity("");
      setMessage(ar ? "تم حفظ الإعلان كمسودة." : "The job posting was saved as a draft.");
    } else setMessage(payload?.message ?? (ar ? "تعذر إنشاء الإعلان." : "The job posting could not be created."));
    setSubmitting(false);
  }

  async function updateApplicationStatus(applicationId: string, status: "UNDER_REVIEW" | "ACCEPTED" | "REJECTED") {
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/talent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateApplicationStatus", applicationId, status }) });
    const payload = await response.json().catch(() => null) as { result?: OwnedApplication; message?: string } | null;
    if (response.ok && payload?.result) setOwnedApplications((current) => current.map((application) => application.id === applicationId ? { ...application, status: payload.result!.status } : application));
    else setMessage(payload?.message ?? (ar ? "تعذر تحديث حالة التقديم." : "The application status could not be updated."));
    setSubmitting(false);
  }

  async function updateStatus(jobPostingId: string, status: "PUBLISHED" | "CLOSED") {
    const response = await fetch("/api/talent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateStatus", jobPostingId, status }) });
    const payload = await response.json().catch(() => null) as { result?: Posting; message?: string } | null;
    if (response.ok && payload?.result) setPostings((current) => current.map((posting) => posting.id === jobPostingId ? payload.result! : posting));
    else setMessage(payload?.message ?? (ar ? "تعذر تحديث الإعلان." : "The job posting could not be updated."));
  }

  async function apply(event: FormEvent<HTMLFormElement>, jobPostingId: string) {
    event.preventDefault();
    const response = await fetch("/api/talent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "apply", jobPostingId, message: applicationMessage || undefined }) });
    const payload = await response.json().catch(() => null) as { result?: { applicantId: string; status: string }; message?: string } | null;
    if (response.ok && payload?.result) {
      setPostings((current) => current.map((posting) => posting.id === jobPostingId ? { ...posting, applications: [...posting.applications, payload.result!] } : posting));
      setApplicationTarget(null); setApplicationMessage("");
      setMessage(ar ? "تم إرسال طلب التقديم." : "Your application was submitted.");
    } else setMessage(payload?.message ?? (ar ? "تعذر إرسال طلب التقديم." : "The application could not be submitted."));
  }

  const visiblePostings = postings.filter((posting) => `${posting.title} ${posting.description} ${posting.department ?? ""} ${posting.city ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="talent-workspace" aria-busy={loading}>
    <header className="talent-workspace__header"><div><span className="eyebrow eyebrow--small">JENAN TALENT</span><h1>{ar ? "الوظائف والفرص المهنية" : "Jobs and career opportunities"}</h1><p>{ar ? "أنشئ إعلاناً وظيفياً أو استكشف الوظائف المنشورة وقدّم طلباً واضحاً. لا تشارك المنصة بيانات المتقدمين علناً." : "Create a job posting or explore published roles and submit a clear application. Applicant data is not exposed publicly."}</p></div><button className="button button--secondary" onClick={() => void load()} type="button">{ar ? "تحديث" : "Refresh"}</button></header>
    <form className="talent-form" onSubmit={createPosting}><input required minLength={2} maxLength={160} placeholder={ar ? "المسمى الوظيفي" : "Job title"} value={title} onChange={(event) => setTitle(event.target.value)} /><input maxLength={120} placeholder={ar ? "القسم أو المجال" : "Department or field"} value={department} onChange={(event) => setDepartment(event.target.value)} /><select aria-label={ar ? "نمط العمل" : "Work mode"} value={workMode} onChange={(event) => setWorkMode(event.target.value as Posting["workMode"])}><option value="ON_SITE">{ar ? "من الموقع" : "On site"}</option><option value="HYBRID">{ar ? "هجين" : "Hybrid"}</option><option value="REMOTE">{ar ? "عن بُعد" : "Remote"}</option></select><input maxLength={120} placeholder={ar ? "المدينة" : "City"} value={city} onChange={(event) => setCity(event.target.value)} /><input maxLength={2} placeholder={ar ? "الدولة" : "Country"} value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} /><textarea required minLength={20} maxLength={4000} placeholder={ar ? "وصف الدور والمسؤوليات" : "Role description and responsibilities"} value={description} onChange={(event) => setDescription(event.target.value)} /><button className="button button--primary" disabled={submitting} type="submit">{submitting ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "إنشاء إعلان" : "Create posting")}</button></form>
    <input className="talent-search" placeholder={ar ? "ابحث في الوظائف المنشورة وإعلاناتك" : "Search published roles and your postings"} value={query} onChange={(event) => setQuery(event.target.value)} />
    {message ? <p className="talent-message" role="status">{message}</p> : null}
    <div className="talent-postings">{loading ? <p className="talent-message">{ar ? "جارٍ تحميل الوظائف..." : "Loading jobs..."}</p> : visiblePostings.map((posting) => { const owned = posting.createdById === viewerId; const application = posting.applications.find((item) => item.applicantId === viewerId); return <article className="talent-posting" key={posting.id}><div className="talent-posting__meta"><span>{posting.workMode.replace("_", " ")}</span><span>{posting.status}</span></div><h2>{posting.title}</h2><p>{posting.description}</p><small>{[posting.department, posting.city, posting.countryCode].filter(Boolean).join(" · ") || (ar ? "بدون موقع محدد" : "Location not specified")}</small>{owned && posting.status === "DRAFT" ? <button className="button button--secondary" onClick={() => void updateStatus(posting.id, "PUBLISHED")} type="button">{ar ? "نشر الإعلان" : "Publish posting"}</button> : null}{owned && posting.status === "PUBLISHED" ? <button className="button button--ghost" onClick={() => void updateStatus(posting.id, "CLOSED")} type="button">{ar ? "إغلاق الإعلان" : "Close posting"}</button> : null}{!owned && posting.status === "PUBLISHED" && !application ? <button className="button button--primary" onClick={() => setApplicationTarget(posting.id)} type="button">{ar ? "تقديم" : "Apply"}</button> : null}{application ? <span className="talent-posting__application">{ar ? "حالة التقديم: " : "Application: "}{application.status}</span> : null}{applicationTarget === posting.id ? <form className="talent-application" onSubmit={(event) => void apply(event, posting.id)}><textarea maxLength={2000} placeholder={ar ? "رسالة تقديم اختيارية" : "Optional application message"} value={applicationMessage} onChange={(event) => setApplicationMessage(event.target.value)} /><button className="button button--primary" type="submit">{ar ? "إرسال الطلب" : "Submit application"}</button></form> : null}</article>; })}{!loading && !visiblePostings.length ? <p className="talent-message">{ar ? "لا توجد وظائف مطابقة." : "No matching jobs."}</p> : null}</div>
    {ownedApplications.length ? <section className="talent-applications"><h2>{ar ? "التقديمات الواردة" : "Incoming applications"}</h2>{ownedApplications.map((application) => <article key={application.id}><div><strong>{application.jobPosting.title}</strong><span>{application.applicant.profile?.displayName ?? application.applicant.email}</span>{application.message ? <p>{application.message}</p> : null}</div><div><strong>{application.status}</strong>{application.status === "SUBMITTED" ? <button className="button button--secondary" disabled={submitting} onClick={() => void updateApplicationStatus(application.id, "UNDER_REVIEW")} type="button">{ar ? "بدء المراجعة" : "Review"}</button> : null}{application.status !== "ACCEPTED" && application.status !== "REJECTED" ? <button className="button button--primary" disabled={submitting} onClick={() => void updateApplicationStatus(application.id, "ACCEPTED")} type="button">{ar ? "قبول" : "Accept"}</button> : null}{application.status !== "ACCEPTED" && application.status !== "REJECTED" ? <button className="button button--ghost" disabled={submitting} onClick={() => void updateApplicationStatus(application.id, "REJECTED")} type="button">{ar ? "رفض" : "Reject"}</button> : null}</div></article>)}</section> : null}
  </section>;
}