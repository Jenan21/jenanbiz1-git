"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Posting = {
  id: string;
  applications: Array<{ applicantId: string; matchScore: number; status: string }>;
  city: string | null;
  countryCode: string | null;
  createdById: string;
  currency: string;
  department: string | null;
  description: string;
  qualityScore: number;
  requiredSkills: string[] | null;
  salaryMaxMinor: number | null;
  salaryMinMinor: number | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  title: string;
  workMode: "ON_SITE" | "HYBRID" | "REMOTE";
};
type OwnedApplication = {
  id: string;
  applicant: { email: string; profile: { displayName: string | null } | null };
  jobPosting: { id: string; title: string };
  matchScore: number;
  message: string | null;
  status: "SUBMITTED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
};

function salary(posting: Posting) {
  if (!posting.salaryMinMinor && !posting.salaryMaxMinor) return null;
  const format = (value: number) => new Intl.NumberFormat("en", { currency: posting.currency, maximumFractionDigits: 0, style: "currency" }).format(value / 100);
  if (posting.salaryMinMinor && posting.salaryMaxMinor) return `${format(posting.salaryMinMinor)} - ${format(posting.salaryMaxMinor)}`;
  return format((posting.salaryMinMinor ?? posting.salaryMaxMinor)!);
}

export function TalentWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [postings, setPostings] = useState<Posting[]>([]);
  const [ownedApplications, setOwnedApplications] = useState<OwnedApplication[]>([]);
  const [viewerId, setViewerId] = useState("");
  const [form, setForm] = useState({ city: "", countryCode: "", department: "", description: "", requiredSkills: "", salaryMax: "", salaryMin: "", title: "", workMode: "ON_SITE" as Posting["workMode"] });
  const [filters, setFilters] = useState({ countryCode: "", query: "", status: "", workMode: "" });
  const [applicationTarget, setApplicationTarget] = useState<string | null>(null);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.query) params.set("search", filters.query);
    if (filters.status) params.set("status", filters.status);
    if (filters.workMode) params.set("workMode", filters.workMode);
    if (filters.countryCode) params.set("countryCode", filters.countryCode);
    const response = await fetch(`/api/talent?${params.toString()}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { applications?: OwnedApplication[]; message?: string; postings?: Posting[]; viewerId?: string } | null;
    if (response.ok && payload?.postings && payload.viewerId) {
      setPostings(payload.postings);
      setOwnedApplications(payload.applications ?? []);
      setViewerId(payload.viewerId);
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر تحميل الوظائف." : "Jobs could not be loaded."));
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

  async function createPosting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/talent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create",
        city: form.city || undefined,
        countryCode: form.countryCode || undefined,
        department: form.department || undefined,
        description: form.description,
        requiredSkills: form.requiredSkills || undefined,
        salaryMaxMinor: form.salaryMax ? Math.round(Number(form.salaryMax) * 100) : undefined,
        salaryMinMinor: form.salaryMin ? Math.round(Number(form.salaryMin) * 100) : undefined,
        title: form.title,
        workMode: form.workMode,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string; result?: Posting } | null;
    if (response.ok && payload?.result) {
      setPostings((current) => [payload.result!, ...current]);
      setForm({ city: "", countryCode: "", department: "", description: "", requiredSkills: "", salaryMax: "", salaryMin: "", title: "", workMode: "ON_SITE" });
      setMessage(ar ? "تم حفظ الإعلان مع درجة جودة أولية." : "Posting saved with an initial quality score.");
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر إنشاء الإعلان." : "The job posting could not be created."));
    }
    setSubmitting(false);
  }

  async function updateStatus(jobPostingId: string, status: "PUBLISHED" | "CLOSED") {
    setMessage("");
    const response = await fetch("/api/talent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateStatus", jobPostingId, status }) });
    const payload = (await response.json().catch(() => null)) as { message?: string; result?: Posting } | null;
    if (response.ok && payload?.result) setPostings((current) => current.map((posting) => posting.id === jobPostingId ? payload.result! : posting));
    else setMessage(payload?.message ?? (ar ? "تعذر تحديث الإعلان." : "The job posting could not be updated."));
  }

  async function apply(event: FormEvent<HTMLFormElement>, jobPostingId: string) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/talent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "apply", jobPostingId, message: applicationMessage || undefined }) });
    const payload = (await response.json().catch(() => null)) as { message?: string; result?: { applicantId: string; matchScore: number; status: string } } | null;
    if (response.ok && payload?.result) {
      setPostings((current) => current.map((posting) => posting.id === jobPostingId ? { ...posting, applications: [...posting.applications, payload.result!] } : posting));
      setApplicationTarget(null);
      setApplicationMessage("");
      setMessage(ar ? "تم إرسال طلب التقديم مع درجة مطابقة أولية." : "Application submitted with an initial match score.");
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر إرسال طلب التقديم." : "The application could not be submitted."));
    }
    setSubmitting(false);
  }

  async function updateApplicationStatus(applicationId: string, status: "UNDER_REVIEW" | "ACCEPTED" | "REJECTED") {
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/talent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateApplicationStatus", applicationId, status }) });
    const payload = (await response.json().catch(() => null)) as { message?: string; result?: OwnedApplication } | null;
    if (response.ok && payload?.result) setOwnedApplications((current) => current.map((application) => application.id === applicationId ? { ...application, status: payload.result!.status } : application));
    else setMessage(payload?.message ?? (ar ? "تعذر تحديث حالة التقديم." : "The application status could not be updated."));
    setSubmitting(false);
  }

  return (
    <section className="talent-workspace" aria-busy={loading}>
      <header className="talent-workspace__header"><div><span className="eyebrow eyebrow--small">JENAN TALENT</span><h1>{ar ? "الوظائف والفرص المهنية" : "Jobs and career opportunities"}</h1><p>{ar ? "إعلانات موثقة بدرجة جودة ومهارات مطلوبة ودرجة مطابقة للتقديمات." : "Quality-scored roles with required skills, salary ranges, and application match scoring."}</p></div><button className="button button--secondary" onClick={() => void load()} type="button">{ar ? "تحديث" : "Refresh"}</button></header>
      <form className="talent-form" onSubmit={createPosting}>
        <input required minLength={2} maxLength={160} placeholder={ar ? "المسمى الوظيفي" : "Job title"} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <input maxLength={120} placeholder={ar ? "القسم أو المجال" : "Department or field"} value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
        <select aria-label={ar ? "نمط العمل" : "Work mode"} value={form.workMode} onChange={(event) => setForm({ ...form, workMode: event.target.value as Posting["workMode"] })}><option value="ON_SITE">{ar ? "من الموقع" : "On site"}</option><option value="HYBRID">{ar ? "هجين" : "Hybrid"}</option><option value="REMOTE">{ar ? "عن بعد" : "Remote"}</option></select>
        <input maxLength={120} placeholder={ar ? "المدينة" : "City"} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
        <input maxLength={2} placeholder={ar ? "الدولة" : "Country"} value={form.countryCode} onChange={(event) => setForm({ ...form, countryCode: event.target.value.toUpperCase() })} />
        <input min="1" placeholder={ar ? "الراتب من" : "Salary from"} type="number" value={form.salaryMin} onChange={(event) => setForm({ ...form, salaryMin: event.target.value })} />
        <input min="1" placeholder={ar ? "الراتب إلى" : "Salary to"} type="number" value={form.salaryMax} onChange={(event) => setForm({ ...form, salaryMax: event.target.value })} />
        <input placeholder={ar ? "المهارات المطلوبة مفصولة بفواصل" : "Required skills, comma separated"} value={form.requiredSkills} onChange={(event) => setForm({ ...form, requiredSkills: event.target.value })} />
        <textarea required minLength={20} maxLength={4000} placeholder={ar ? "وصف الدور والمسؤوليات" : "Role description and responsibilities"} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <button className="button button--primary" disabled={submitting} type="submit">{submitting ? (ar ? "جار الحفظ..." : "Saving...") : (ar ? "إنشاء إعلان" : "Create posting")}</button>
      </form>
      <div className="talent-filters"><input placeholder={ar ? "بحث" : "Search"} value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} /><select value={filters.workMode} onChange={(event) => setFilters({ ...filters, workMode: event.target.value })}><option value="">{ar ? "كل الأنماط" : "All modes"}</option><option value="ON_SITE">ON SITE</option><option value="HYBRID">HYBRID</option><option value="REMOTE">REMOTE</option></select><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">{ar ? "كل الحالات" : "All statuses"}</option><option value="PUBLISHED">PUBLISHED</option><option value="DRAFT">DRAFT</option><option value="CLOSED">CLOSED</option></select><input maxLength={2} placeholder={ar ? "الدولة" : "Country"} value={filters.countryCode} onChange={(event) => setFilters({ ...filters, countryCode: event.target.value.toUpperCase() })} /><button className="button button--secondary" onClick={() => void load()} type="button">{ar ? "تطبيق" : "Apply"}</button></div>
      {message ? <p className="talent-message" role="status">{message}</p> : null}
      <div className="talent-postings">{loading ? <p className="talent-message">{ar ? "جار تحميل الوظائف..." : "Loading jobs..."}</p> : postings.map((posting) => { const owned = posting.createdById === viewerId; const application = posting.applications.find((item) => item.applicantId === viewerId); return <article className="talent-posting" key={posting.id}><div className="talent-posting__meta"><span>{posting.workMode.replace("_", " ")}</span><span>{posting.status}</span><span>{ar ? "جودة" : "Quality"}: {posting.qualityScore}/100</span></div><h2>{posting.title}</h2><p>{posting.description}</p><small>{[posting.department, posting.city, posting.countryCode, salary(posting)].filter(Boolean).join(" · ") || (ar ? "بدون موقع محدد" : "Location not specified")}</small>{posting.requiredSkills?.length ? <div className="talent-posting__skills">{posting.requiredSkills.map((skill) => <span key={skill}>{skill}</span>)}</div> : null}{owned && posting.status === "DRAFT" ? <button className="button button--secondary" onClick={() => void updateStatus(posting.id, "PUBLISHED")} type="button">{ar ? "نشر الإعلان" : "Publish posting"}</button> : null}{owned && posting.status === "PUBLISHED" ? <button className="button button--ghost" onClick={() => void updateStatus(posting.id, "CLOSED")} type="button">{ar ? "إغلاق الإعلان" : "Close posting"}</button> : null}{!owned && posting.status === "PUBLISHED" && !application ? <button className="button button--primary" onClick={() => setApplicationTarget(posting.id)} type="button">{ar ? "تقديم" : "Apply"}</button> : null}{application ? <span className="talent-posting__application">{ar ? "المطابقة: " : "Match: "}{application.matchScore}% · {application.status}</span> : null}{applicationTarget === posting.id ? <form className="talent-application" onSubmit={(event) => void apply(event, posting.id)}><textarea minLength={20} maxLength={2000} placeholder={ar ? "رسالة تقديم تتضمن خبراتك ومهاراتك" : "Application message with your experience and skills"} value={applicationMessage} onChange={(event) => setApplicationMessage(event.target.value)} /><button className="button button--primary" disabled={submitting} type="submit">{ar ? "إرسال الطلب" : "Submit application"}</button></form> : null}</article>; })}{!loading && !postings.length ? <p className="talent-message">{ar ? "لا توجد وظائف مطابقة." : "No matching jobs."}</p> : null}</div>
      {ownedApplications.length ? <section className="talent-applications"><h2>{ar ? "التقديمات الواردة" : "Incoming applications"}</h2>{ownedApplications.map((application) => <article key={application.id}><div><strong>{application.jobPosting.title}</strong><span>{application.applicant.profile?.displayName ?? application.applicant.email}</span><small>{ar ? "درجة المطابقة" : "Match score"}: {application.matchScore}%</small>{application.message ? <p>{application.message}</p> : null}</div><div><strong>{application.status}</strong>{application.status === "SUBMITTED" ? <button className="button button--secondary" disabled={submitting} onClick={() => void updateApplicationStatus(application.id, "UNDER_REVIEW")} type="button">{ar ? "بدء المراجعة" : "Review"}</button> : null}{application.status !== "ACCEPTED" && application.status !== "REJECTED" ? <button className="button button--primary" disabled={submitting} onClick={() => void updateApplicationStatus(application.id, "ACCEPTED")} type="button">{ar ? "قبول" : "Accept"}</button> : null}{application.status !== "ACCEPTED" && application.status !== "REJECTED" ? <button className="button button--ghost" disabled={submitting} onClick={() => void updateApplicationStatus(application.id, "REJECTED")} type="button">{ar ? "رفض" : "Reject"}</button> : null}</div></article>)}</section> : null}
    </section>
  );
}