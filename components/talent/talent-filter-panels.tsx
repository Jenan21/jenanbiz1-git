"use client";

import type { Dispatch, SetStateAction } from "react";

import { Icon } from "@/components/ui/icons";
import type { ApplicantFilters, JobFilters, TalentFilters } from "@/lib/talent/talent-filters";
import type { Locale } from "@/types/i18n";

function Footer({ locale, onClear, resultCount }: { locale: Locale; onClear: () => void; resultCount: number }) {
  const ar = locale === "ar";
  return <footer><span>{resultCount} {ar ? "نتيجة من البيانات المصرح بها" : "results from authorized data"}</span><button onClick={onClear} type="button">{ar ? "مسح الفلاتر" : "Clear filters"}</button></footer>;
}

export function TalentJobFilters({ countries, filters, locale, resultCount, setFilters }: { countries: string[]; filters: JobFilters; locale: Locale; resultCount: number; setFilters: Dispatch<SetStateAction<JobFilters>> }) {
  const ar = locale === "ar";
  return <section className="talent-flow__filters talent-flow__filters--advanced" aria-label={ar ? "فلاتر الوظائف" : "Job filters"}>
    <label className="is-search"><Icon name="search" /><input aria-label={ar ? "بحث الوظائف" : "Search jobs"} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder={ar ? "المسمى أو الوصف" : "Title or description"} value={filters.query} /></label>
    <input aria-label={ar ? "مهارات الوظيفة" : "Job skills"} onChange={(event) => setFilters((current) => ({ ...current, skills: event.target.value }))} placeholder={ar ? "مهارات مطلوبة، مفصولة بفواصل" : "Required skills, comma separated"} value={filters.skills} />
    <select aria-label={ar ? "دولة الوظيفة" : "Job country"} onChange={(event) => setFilters((current) => ({ ...current, countryCode: event.target.value }))} value={filters.countryCode}><option value="">{ar ? "كل الدول" : "All countries"}</option>{countries.map((country) => <option key={country}>{country}</option>)}</select>
    <input aria-label={ar ? "مدينة الوظيفة" : "Job city"} onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))} placeholder={ar ? "المدينة" : "City"} value={filters.city} />
    <select aria-label={ar ? "نمط العمل" : "Work mode"} onChange={(event) => setFilters((current) => ({ ...current, workMode: event.target.value }))} value={filters.workMode}><option value="">{ar ? "كل الأنماط" : "All modes"}</option><option value="ON_SITE">ON SITE</option><option value="HYBRID">HYBRID</option><option value="REMOTE">REMOTE</option></select>
    <input aria-label={ar ? "الحد الأدنى للراتب" : "Minimum salary"} min="0" onChange={(event) => setFilters((current) => ({ ...current, minSalaryMajor: event.target.value ? Number(event.target.value) : null }))} placeholder={ar ? "راتب أدنى" : "Minimum salary"} type="number" value={filters.minSalaryMajor ?? ""} />
    <select aria-label={ar ? "ترتيب الوظائف" : "Job sort"} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as JobFilters["sort"] }))} value={filters.sort}><option value="quality">{ar ? "الأعلى جودة" : "Highest quality"}</option><option value="recent">{ar ? "الأحدث" : "Most recent"}</option><option value="salary">{ar ? "أعلى راتب معلن" : "Highest disclosed salary"}</option></select>
    <Footer locale={locale} onClear={() => setFilters({ city: "", countryCode: "", minSalaryMajor: null, query: "", skills: "", sort: "quality", workMode: "" })} resultCount={resultCount} />
  </section>;
}

export function TalentProfileFilters({ countries, filters, locale, resultCount, setFilters }: { countries: string[]; filters: TalentFilters; locale: Locale; resultCount: number; setFilters: Dispatch<SetStateAction<TalentFilters>> }) {
  const ar = locale === "ar";
  return <section className="talent-flow__filters talent-flow__filters--advanced" aria-label={ar ? "فلاتر المواهب" : "Talent filters"}>
    <label className="is-search"><Icon name="search" /><input aria-label={ar ? "بحث المواهب" : "Search talent"} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder={ar ? "المسمى أو النبذة" : "Headline or summary"} value={filters.query} /></label>
    <input aria-label={ar ? "مهارات المرشح" : "Candidate skills"} onChange={(event) => setFilters((current) => ({ ...current, skills: event.target.value }))} placeholder={ar ? "المهارات، مفصولة بفواصل" : "Skills, comma separated"} value={filters.skills} />
    <input aria-label={ar ? "الحد الأدنى للخبرة" : "Minimum experience"} min="0" max="80" onChange={(event) => setFilters((current) => ({ ...current, minExperience: event.target.value ? Number(event.target.value) : null }))} placeholder={ar ? "سنوات الخبرة" : "Years experience"} type="number" value={filters.minExperience ?? ""} />
    <select aria-label={ar ? "دولة المرشح" : "Candidate country"} onChange={(event) => setFilters((current) => ({ ...current, countryCode: event.target.value }))} value={filters.countryCode}><option value="">{ar ? "كل الدول" : "All countries"}</option>{countries.map((country) => <option key={country}>{country}</option>)}</select>
    <select aria-label={ar ? "نمط العمل المطلوب" : "Desired work mode"} onChange={(event) => setFilters((current) => ({ ...current, workMode: event.target.value }))} value={filters.workMode}><option value="">{ar ? "كل الأنماط" : "All modes"}</option><option value="ON_SITE">ON SITE</option><option value="HYBRID">HYBRID</option><option value="REMOTE">REMOTE</option></select>
    <input aria-label={ar ? "توفر المرشح" : "Candidate availability"} onChange={(event) => setFilters((current) => ({ ...current, availability: event.target.value }))} placeholder={ar ? "مثال: 30 يوم" : "e.g. 30 days"} value={filters.availability} />
    <select aria-label={ar ? "ترتيب المواهب" : "Talent sort"} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as TalentFilters["sort"] }))} value={filters.sort}><option value="recent">{ar ? "الأحدث" : "Most recent"}</option><option value="experience">{ar ? "الأكثر خبرة" : "Most experienced"}</option></select>
    <Footer locale={locale} onClear={() => setFilters({ availability: "", countryCode: "", minExperience: null, query: "", skills: "", sort: "recent", workMode: "" })} resultCount={resultCount} />
  </section>;
}

export function TalentApplicantFilters({ filters, locale, postings, resultCount, setFilters }: { filters: ApplicantFilters; locale: Locale; postings: Array<{ id: string; title: string }>; resultCount: number; setFilters: Dispatch<SetStateAction<ApplicantFilters>> }) {
  const ar = locale === "ar";
  return <section className="talent-flow__filters talent-flow__filters--advanced talent-flow__filters--applicants" aria-label={ar ? "فلاتر المتقدمين" : "Applicant filters"}>
    <select aria-label={ar ? "حالة المتقدم" : "Applicant status"} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} value={filters.status}><option value="">{ar ? "كل الحالات" : "All statuses"}</option>{["SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"].map((status) => <option key={status}>{status.replace("_", " ")}</option>)}</select>
    <select aria-label={ar ? "وظيفة المتقدم" : "Applicant job"} onChange={(event) => setFilters((current) => ({ ...current, jobPostingId: event.target.value }))} value={filters.jobPostingId}><option value="">{ar ? "كل الوظائف" : "All postings"}</option>{postings.map((posting) => <option key={posting.id} value={posting.id}>{posting.title}</option>)}</select>
    <input aria-label={ar ? "الحد الأدنى للمطابقة" : "Minimum match"} min="0" max="100" onChange={(event) => setFilters((current) => ({ ...current, minMatch: event.target.value ? Number(event.target.value) : null }))} placeholder={ar ? "مطابقة أدنى %" : "Minimum match %"} type="number" value={filters.minMatch ?? ""} />
    <select aria-label={ar ? "ترتيب المتقدمين" : "Applicant sort"} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as ApplicantFilters["sort"] }))} value={filters.sort}><option value="match">{ar ? "الأعلى مطابقة" : "Highest match"}</option><option value="recent">{ar ? "الأحدث" : "Most recent"}</option><option value="oldest">{ar ? "الأقدم" : "Oldest first"}</option></select>
    <Footer locale={locale} onClear={() => setFilters({ jobPostingId: "", minMatch: null, sort: "match", status: "" })} resultCount={resultCount} />
  </section>;
}