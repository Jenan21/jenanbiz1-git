"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState, type CSSProperties } from "react";

import type {
  OwnedTalentApplication,
  TalentPayload,
  TalentPosting,
} from "@/components/talent/talent-flow-types";
import { TalentConversation } from "@/components/talent/talent-conversation";
import {
  TalentApplicantFilters,
  TalentJobFilters,
  TalentProfileFilters,
} from "@/components/talent/talent-filter-panels";
import { Icon } from "@/components/ui/icons";
import {
  filterDiscoverableTalent,
  filterTalentApplicants,
  filterTalentJobs,
  type ApplicantFilters,
  type JobFilters,
  type TalentFilters,
} from "@/lib/talent/talent-filters";
import type { TalentFlowRoute } from "@/lib/talent/talent-routes";
import type { Locale } from "@/types/i18n";

type TalentCommand = Record<string, unknown> & { action: string };

const routeDescriptions: Record<TalentFlowRoute["id"], [string, string]> = {
  dashboard: [
    "اكتشف فرص العمل المناسبة لك، وابنِ ملفك المهني لتحقيق مستقبل أفضل.",
    "Discover suitable roles and build your professional profile for a stronger future.",
  ],
  jobs: [
    "اكتشف فرص العمل المناسبة لك وتابع حالة طلباتك نحو مستقبل مهني أفضل.",
    "Discover suitable roles and track your applications toward a stronger career.",
  ],
  "job-detail": [
    "متطلبات ومهارات ونطاق مالي ومصدر واضح للإعلان.",
    "Requirements, skills, salary range, and a clear posting source.",
  ],
  apply: [
    "شارك رسالتك وملفك المهني مع موافقة صريحة ومحددة.",
    "Share your message and professional profile with explicit, scoped consent.",
  ],
  profile: [
    "أكمل ملفك المهني لزيادة فرصك في الحصول على أفضل الفرص الوظيفية.",
    "Complete your profile to improve your access to the best suitable roles.",
  ],
  employer: [
    "إعلاناتك والمتقدمون وجودة الوصف ومراحل التوظيف.",
    "Your postings, applicants, listing quality, and hiring stages.",
  ],
  "employer-post": [
    "انشر وصفاً واضحاً بمهارات وموقع ونطاق مالي واقعي.",
    "Publish a clear role with skills, location, and a realistic salary range.",
  ],
  "employer-applicants": [
    "راجع الطلبات وانقلها بين مراحل موثقة دون وعود توظيف.",
    "Review applications and move them through documented stages without employment guarantees.",
  ],
  candidate: [
    "ملف المرشح الذي وافق على مشاركته مع صاحب الإعلان.",
    "The candidate profile explicitly shared with the posting owner.",
  ],
  search: [
    "ابحث فقط في الملفات التي اختار أصحابها الظهور العام.",
    "Search only profiles whose owners opted into discovery.",
  ],
  matching: [
    "مطابقة حتمية تشرح المهارات المتوافقة والفجوات.",
    "Deterministic matching that explains aligned skills and gaps.",
  ],
  reports: [
    "مؤشرات توظيف مستخرجة من الإعلانات والطلبات الحالية.",
    "Hiring metrics derived from current postings and applications.",
  ],
};

function pick(copy: readonly [string, string], locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

function formValue(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function optional(form: FormData, key: string) {
  return formValue(form, key) || undefined;
}

function money(form: FormData, key: string) {
  const raw = formValue(form, key);
  return raw ? Math.round(Number(raw) * 100) : undefined;
}

function salary(posting: TalentPosting, locale: Locale) {
  if (!posting.salaryMinMinor && !posting.salaryMaxMinor)
    return locale === "ar" ? "غير معلن" : "Not disclosed";
  const format = (amount: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: posting.currency,
      maximumFractionDigits: 0,
    }).format(amount / 100);
  if (posting.salaryMinMinor && posting.salaryMaxMinor)
    return `${format(posting.salaryMinMinor)} – ${format(posting.salaryMaxMinor)}`;
  return format((posting.salaryMinMinor ?? posting.salaryMaxMinor)!);
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", {
    dateStyle: "medium",
  }).format(new Date(value));
}

const statusLabels: Record<string, [string, string]> = {
  ACCEPTED: ["المرحلة التالية", "Advanced"],
  ARCHIVED: ["مؤرشف", "Archived"],
  CLOSED: ["مغلق", "Closed"],
  DRAFT: ["مسودة", "Draft"],
  HYBRID: ["هجين", "Hybrid"],
  ON_SITE: ["حضوري", "On site"],
  PUBLISHED: ["منشور", "Published"],
  REJECTED: ["مرفوض", "Rejected"],
  REMOTE: ["عن بُعد", "Remote"],
  SUBMITTED: ["تم التقديم", "Submitted"],
  UNDER_REVIEW: ["قيد المراجعة", "Under review"],
  WITHDRAWN: ["مسحوب", "Withdrawn"],
};

function Status({ locale, value }: { locale: Locale; value: string }) {
  const label = statusLabels[value];
  return (
    <span
      className={`talent-flow__status talent-flow__status--${value.toLowerCase()}`}
    >
      {label ? pick(label, locale) : value.replaceAll("_", " ")}
    </span>
  );
}

function EmptyState({ locale, message }: { locale: Locale; message?: string }) {
  return (
    <div className="talent-flow__empty">
      <Icon name="search" />
      <p>
        {message ??
          (locale === "ar"
            ? "لا توجد نتائج حالياً."
            : "No results are available yet.")}
      </p>
    </div>
  );
}

export function TalentFlowWorkspace({
  applicationId,
  jobId,
  locale,
  route,
}: {
  applicationId?: string;
  jobId?: string;
  locale: Locale;
  route: TalentFlowRoute;
}) {
  const ar = locale === "ar";
  const audience =
    route.id.startsWith("employer") ||
    route.id === "candidate" ||
    route.id === "reports"
      ? "EMPLOYER"
      : "CANDIDATE";
  const [data, setData] = useState<TalentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [jobFilters, setJobFilters] = useState<JobFilters>({
    city: "",
    countryCode: "",
    minSalaryMajor: null,
    query: "",
    skills: "",
    sort: "quality",
    workMode: "",
  });
  const [profileFilters, setProfileFilters] = useState<TalentFilters>({
    availability: "",
    countryCode: "",
    minExperience: null,
    query: "",
    skills: "",
    sort: "recent",
    workMode: "",
  });
  const [applicantFilters, setApplicantFilters] = useState<ApplicantFilters>({
    jobPostingId: "",
    minMatch: null,
    sort: "match",
    status: "",
  });
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const response = await fetch("/api/talent", { cache: "no-store" });
      const payload = (await response
        .json()
        .catch(() => null)) as TalentPayload | null;
      if (!active) return;
      if (response.ok && payload) setData(payload);
      else
        setMessage(
          payload?.message ??
            (ar
              ? "تعذر تحميل مساحة المواهب."
              : "Talent workspace could not be loaded."),
        );
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [ar, refreshVersion]);

  async function runCommand(command: TalentCommand, success: [string, string]) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/talent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    if (response.ok) {
      setMessage(pick(success, locale));
      setRefreshVersion((version) => version + 1);
      setBusy(false);
      return true;
    }
    setMessage(
      payload?.message ??
        (ar ? "تعذر تنفيذ العملية." : "The action could not be completed."),
    );
    setBusy(false);
    return false;
  }

  const selectedJob =
    data?.postings.find((posting) => posting.id === jobId) ??
    data?.postings.find((posting) => posting.status === "PUBLISHED") ??
    data?.postings[0];
  const selectedApplication =
    data?.applications.find(
      (application) => application.id === applicationId,
    ) ?? data?.applications[0];
  const visibleJobs = data
    ? filterTalentJobs(data.postings, data.viewerId, jobFilters)
    : [];
  const visibleTalent = data
    ? filterDiscoverableTalent(data.talent, profileFilters)
    : [];
  const visibleApplicants = data
    ? filterTalentApplicants(data.applications, applicantFilters)
    : [];
  const ownedPostings =
    data?.postings.filter((posting) => posting.createdById === data.viewerId) ??
    [];
  const jobCountries = [
    ...new Set(
      data?.postings.flatMap((posting) =>
        posting.countryCode ? [posting.countryCode] : [],
      ) ?? [],
    ),
  ].sort();
  const talentCountries = [
    ...new Set(
      data?.talent.flatMap((candidate) =>
        candidate.countryCode ? [candidate.countryCode] : [],
      ) ?? [],
    ),
  ].sort();
  const currentApplication = selectedJob
    ? data?.ownApplications.find(
        (application) => application.jobPosting.id === selectedJob.id,
      )
    : undefined;
  const profile = data?.talentProfile.profile;
  const profileCompletion = profile
    ? Math.round(
        [
          profile.headline,
          profile.summary,
          profile.city,
          profile.countryCode,
          profile.skills?.length,
          profile.experience,
          profile.education,
          profile.cvDocumentId,
        ].filter(Boolean).length * 12.5,
      )
    : 0;

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await runCommand(
      {
        action: "saveProfile",
        headline: formValue(values, "headline"),
        summary: formValue(values, "summary"),
        city: optional(values, "city"),
        countryCode: optional(values, "countryCode"),
        yearsExperience: Number(formValue(values, "yearsExperience") || 0),
        skills: optional(values, "skills"),
        experience: optional(values, "experience"),
        education: optional(values, "education"),
        desiredWorkModes: values.getAll("workMode").map(String),
        availability: optional(values, "availability"),
        cvDocumentId: optional(values, "cvDocumentId"),
        isDiscoverable: values.get("isDiscoverable") === "on",
      },
      ["تم حفظ الملف المهني.", "Professional profile saved."],
    );
  }

  async function submitPosting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const questions = formValue(values, "screeningQuestions")
      .split(/\r?\n/)
      .map((prompt) => prompt.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((prompt) => ({ prompt, required: true }));
    if (
      await runCommand(
        {
          action: "create",
          title: formValue(values, "title"),
          description: formValue(values, "description"),
          benefits: optional(values, "benefits"),
          conditions: optional(values, "conditions"),
          organizationId: optional(values, "organizationId"),
          department: optional(values, "department"),
          countryCode: optional(values, "countryCode"),
          city: optional(values, "city"),
          salaryMinMinor: money(values, "salaryMin"),
          salaryMaxMinor: money(values, "salaryMax"),
          requiredSkills: optional(values, "requiredSkills"),
          questions,
          workMode: formValue(values, "workMode"),
        },
        ["تم حفظ الإعلان واحتساب جودته.", "Posting saved and quality-scored."],
      )
    )
      form.reset();
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedJob) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const answers = selectedJob.questions.flatMap((question) => {
      const answer = formValue(values, `question-${question.id}`);
      return answer ? [{ questionId: question.id, answer }] : [];
    });
    if (
      await runCommand(
        {
          action: "apply",
          jobPostingId: selectedJob.id,
          message: optional(values, "applicationMessage"),
          answers,
          cvDocumentId: optional(values, "cvDocumentId"),
          shareProfile: values.get("shareProfile") === "on",
        },
        [
          "تم إرسال الطلب مع درجة مطابقة أولية. لا يمثل ذلك ضماناً للتوظيف.",
          "Application submitted with an initial match score. This does not guarantee employment.",
        ],
      )
    )
      form.reset();
  }

  if (loading || !data)
    return (
      <section
        className={`talent-flow talent-flow--${audience.toLowerCase()} talent-flow--${route.id}`}
        data-talent-privacy="CONSENT_SCOPED"
        data-talent-role={audience}
        data-talent-route={route.route}
        data-talent-source="LOADING"
      >
        <header className="talent-flow__hero">
          <div>
            <span>TALENT · {route.id.toUpperCase()}</span>
            <h1>{pick(route.title, locale)}</h1>
            <p>{pick(routeDescriptions[route.id], locale)}</p>
          </div>
        </header>
        <div className="talent-flow__loading">
          <span />
          {ar ? "جارٍ تحميل رحلة التوظيف..." : "Loading the hiring journey..."}
        </div>
      </section>
    );

  return (
    <section
      className={`talent-flow talent-flow--${audience.toLowerCase()} talent-flow--${route.id}`}
      data-talent-privacy="CONSENT_SCOPED"
      data-talent-role={audience}
      data-talent-route={route.route}
      data-talent-source="PERSISTED_RECORDS"
    >
      {route.id === "dashboard" ? (
        <aside className="talent-seeker-sidebar">
          <Link className="talent-seeker-sidebar__brand" href="/dashboard">
            <strong>Jenan PRO</strong>
            <small>{ar ? "مركز الأعمال الذكي" : "Intelligent Business Center"}</small>
          </Link>
          <nav aria-label={ar ? "مساحة الباحث عن وظيفة" : "Job seeker workspace"}>
            <Link className="is-active" href="/talent">
              <Icon name="dashboard" />
              {ar ? "الرئيسية" : "Overview"}
            </Link>
            <Link href="/talent/jobs">
              <Icon name="briefcase" />
              {ar ? "الوظائف" : "Jobs"}
            </Link>
            <Link href="/talent/profile">
              <Icon name="user" />
              {ar ? "ملفي" : "My profile"}
            </Link>
            <Link href="/talent/jobs#applications">
              <Icon name="activity" />
              {ar ? "طلباتي" : "Applications"}
            </Link>
          </nav>
          <Link className="talent-seeker-sidebar__back" href="/dashboard">
            <Icon name="arrow" />
            {ar ? "العودة للرئيسية" : "Back to home"}
          </Link>
          <blockquote>
            “{ar ? "فرص أفضل لمستقبل أوسع" : "Better opportunities for a broader future"}”
          </blockquote>
        </aside>
      ) : audience === "CANDIDATE" ? (
        <Link className="talent-seeker-back" href="/talent">
          <Icon name="dashboard" />
          {ar ? "العودة للرئيسية" : "Back to overview"}
        </Link>
      ) : null}
      <header className="talent-flow__hero">
        <div className="talent-flow__hero-copy">
          <span>TALENT · {route.id.toUpperCase().replaceAll("-", " ")}</span>
          <h1>{pick(route.title, locale)}</h1>
          <p>{pick(routeDescriptions[route.id], locale)}</p>
        </div>
        <div className="talent-flow__hero-network" aria-hidden="true">
          <span><Icon name="briefcase" /></span>
          <span><Icon name="user" /></span>
          <span><Icon name="sparkles" /></span>
          <i />
          <i />
          <i />
        </div>
        {route.id === "dashboard" ? (
          <div className="talent-seeker-hero-card">
            <div className="talent-seeker-hero-card__identity">
              <span><Icon name="user" /></span>
              <strong>{profile?.headline ?? (ar ? "ملف مهني جديد" : "New professional profile")}</strong>
              <small>{profile?.availability ?? (ar ? "أكمل ملفك للحصول على فرص مناسبة" : "Complete your profile for suitable roles")}</small>
            </div>
            <div className="talent-seeker-hero-card__match">
              <strong>{data.matches.candidateMatches[0]?.score ?? "—"}{data.matches.candidateMatches.length ? "%" : ""}</strong>
              <small>{ar ? "معدل التطابق الوظيفي" : "Job match rate"}</small>
            </div>
            <div className="talent-seeker-hero-card__alerts">
              <span><Icon name="briefcase" />{data.matches.candidateMatches.length} {ar ? "فرص مناسبة" : "matched roles"}</span>
              <span><Icon name="check" />{data.ownApplications.length} {ar ? "طلبات مرسلة" : "applications"}</span>
              <span><Icon name="bell" />{data.ownApplications.filter((application) => application.status === "UNDER_REVIEW").length} {ar ? "قيد المراجعة" : "under review"}</span>
            </div>
          </div>
        ) : null}
        <div className="talent-flow__promise">
          <Icon name="shield" />
          <strong>
            {ar ? "قرار بشري موثّق" : "Documented human decision"}
          </strong>
          <small>
            {ar
              ? "المطابقة مساعدة ولا تضمن التوظيف"
              : "Matching assists and never guarantees employment"}
          </small>
        </div>
      </header>
      {message ? (
        <p className="talent-flow__message" role="status">
          {message}
        </p>
      ) : null}

      {route.id === "dashboard" ? (
        <>
          <section className="talent-flow__entry">
            <button className="talent-seeker-service--disabled" disabled type="button">
              <Icon name="user" />
              <div>
                <h2>{ar ? "رفع صورتك" : "Add your photo"}</h2>
                <p>{ar ? "رفع الصورة غير متصل بعد؛ لن تُعرض صورة تجريبية." : "Photo upload is not connected yet; no sample photo is shown."}</p>
              </div>
              <small>{ar ? "غير متاح حاليًا" : "Unavailable"}</small>
            </button>
            <Link href="/studio/cv">
              <Icon name="activity" />
              <div>
                <h2>{ar ? "رفع السيرة الذاتية" : "Add your CV"}</h2>
                <p>{ar ? "أنشئ سيرتك أو حدّثها بأدوات Jenan PRO." : "Create or update your CV with Jenan PRO tools."}</p>
              </div>
              <Icon name="arrow" />
            </Link>
            <Link href="/talent/profile">
              <Icon name="user" />
              <div>
                <h2>{ar ? "استكمال الملف الشخصي" : "Complete your profile"}</h2>
                <p>{ar ? "أكمل بياناتك لزيادة فرص ظهورك لأصحاب العمل." : "Complete your information to improve employer discovery."}</p>
              </div>
              <Icon name="arrow" />
            </Link>
            <Link href="/talent/jobs">
              <Icon name="sparkles" />
              <div>
                <h2>{ar ? "الوظائف المناسبة لك" : "Suitable jobs"}</h2>
                <p>
                  {ar
                    ? "اكتشف فرصًا مناسبة لمهاراتك واهتماماتك."
                    : "Discover roles aligned with your skills and interests."}
                </p>
              </div>
              <Icon name="arrow" />
            </Link>
            <Link href="/talent/jobs#applications">
              <Icon name="briefcase" />
              <div>
                <h2>{ar ? "تتبع الطلبات" : "Track applications"}</h2>
                <p>
                  {ar
                    ? "تابع حالة طلباتك ومراحل التوظيف بسهولة."
                    : "Follow your applications and hiring stages."}
                </p>
              </div>
              <Icon name="arrow" />
            </Link>
          </section>
          <Link className="talent-seeker-search-launcher" href="/talent/jobs">
            <Icon name="search" />
            <span>{ar ? "ابحث عن وظيفة: مثال، مطور، محاسب، مصمم..." : "Search for a role: developer, accountant, designer..."}</span>
            <strong>{ar ? "بحث عن الوظائف" : "Search jobs"}</strong>
          </Link>
          <section className="talent-flow__signals">
            <article>
              <span><Icon name="briefcase" /></span>
              <strong>{visibleJobs.length}</strong>
              <small>{ar ? "وظائف متاحة" : "Open roles"}</small>
            </article>
            <article>
              <span><Icon name="check" /></span>
              <strong>{data.ownApplications.filter((application) => application.status === "SUBMITTED").length}</strong>
              <small>{ar ? "تم التقديم" : "Submitted"}</small>
            </article>
            <article>
              <span><Icon name="activity" /></span>
              <strong>{data.ownApplications.filter((application) => application.status === "UNDER_REVIEW").length}</strong>
              <small>{ar ? "قيد المراجعة" : "Under review"}</small>
            </article>
            <article>
              <span><Icon name="sparkles" /></span>
              <strong>{data.matches.candidateMatches[0]?.score ?? "—"}{data.matches.candidateMatches.length ? "%" : ""}</strong>
              <small>{ar ? "أفضل تطابق حالي" : "Best current match"}</small>
            </article>
          </section>
          <section className="talent-seeker-overview-grid">
            <article className="talent-seeker-overview-grid__profile">
              <header>
                <div>
                  <span>{profileCompletion}%</span>
                  <small>{ar ? "اكتمال الملف" : "profile complete"}</small>
                </div>
                <h2>{ar ? "أكمل ملفك المهني" : "Complete your profile"}</h2>
              </header>
              <ul>
                <li className={profile?.headline ? "is-complete" : undefined}><Icon name="check" />{ar ? "المعلومات الأساسية" : "Basic information"}</li>
                <li className={profile?.cvDocumentId ? "is-complete" : undefined}><Icon name="check" />{ar ? "السيرة الذاتية" : "CV"}</li>
                <li className={profile?.experience ? "is-complete" : undefined}><Icon name="check" />{ar ? "الخبرات العملية" : "Work experience"}</li>
                <li className={profile?.skills?.length ? "is-complete" : undefined}><Icon name="check" />{ar ? "المهارات" : "Skills"}</li>
                <li className={profile?.education ? "is-complete" : undefined}><Icon name="check" />{ar ? "التعليم والشهادات" : "Education and certificates"}</li>
              </ul>
              <Link href="/talent/profile">{ar ? "استكمال الملف الشخصي" : "Complete profile"}<Icon name="arrow" /></Link>
            </article>
            <article className="talent-seeker-overview-grid__matches">
              <header>
                <div>
                  <span>{ar ? "مختارة بناءً على ملفك" : "Selected from your profile"}</span>
                  <h2>{ar ? "وظائف مناسبة لك" : "Suitable jobs"}</h2>
                </div>
                <Link href="/talent/jobs">{ar ? "عرض جميع الوظائف" : "View all jobs"}<Icon name="arrow" /></Link>
              </header>
              {data.matches.candidateMatches.slice(0, 3).map((match) => (
                <section key={match.posting.id}>
                  <strong>{match.score}%</strong>
                  <div>
                    <h3>{match.posting.title}</h3>
                    <p>{match.posting.organization?.name ?? (ar ? "صاحب إعلان مستقل" : "Independent employer")}</p>
                    <small>{[match.posting.city, match.posting.countryCode, match.posting.workMode.replace("_", " ")].filter(Boolean).join(" · ")}</small>
                  </div>
                  <Link href={`/talent/job/sample?job=${match.posting.id}`}>{ar ? "عرض الوظيفة" : "View role"}</Link>
                </section>
              ))}
              {!data.matches.candidateMatches.length ? (
                <EmptyState locale={locale} message={ar ? "أكمل ملفك لاحتساب الوظائف المناسبة." : "Complete your profile to calculate suitable roles."} />
              ) : null}
            </article>
            <article className="talent-seeker-overview-grid__activity">
              <header>
                <Icon name="activity" />
                <h2>{ar ? "ملخص طلباتي" : "Application summary"}</h2>
              </header>
              <div>
                {["ACCEPTED", "UNDER_REVIEW", "SUBMITTED", "REJECTED"].map((status) => (
                  <span key={status}>
                    <strong>{data.ownApplications.filter((application) => application.status === status).length}</strong>
                    <Status locale={locale} value={status} />
                  </span>
                ))}
              </div>
              <header>
                <Icon name="briefcase" />
                <h2>{ar ? "أحدث الفرص" : "Latest opportunities"}</h2>
              </header>
              {visibleJobs.slice(0, 3).map((posting) => (
                <Link href={`/talent/job/sample?job=${posting.id}`} key={posting.id}>
                  <span><Icon name="briefcase" /></span>
                  <div><strong>{posting.title}</strong><small>{[posting.city, posting.countryCode].filter(Boolean).join(" · ") || (ar ? "الموقع غير محدد" : "Location unavailable")}</small></div>
                  <Icon name="chevron" />
                </Link>
              ))}
              {!visibleJobs.length ? <p>{ar ? "لا توجد فرص منشورة حاليًا." : "No published roles are available yet."}</p> : null}
            </article>
          </section>
        </>
      ) : null}

      {route.id === "jobs" ? (
        <>
          <TalentJobFilters
            countries={jobCountries}
            filters={jobFilters}
            locale={locale}
            resultCount={visibleJobs.length}
            setFilters={setJobFilters}
          />
          <section className="talent-job-grid">
            {visibleJobs.map((posting) => (
              <article key={posting.id}>
                <header>
                  <Status locale={locale} value={posting.workMode} />
                  <span>
                    {data.matches.candidateMatches.find((match) => match.posting.id === posting.id)?.score != null
                      ? `${data.matches.candidateMatches.find((match) => match.posting.id === posting.id)!.score}% ${ar ? "مطابقة" : "match"}`
                      : `${posting.qualityScore}/100 ${ar ? "جودة الإعلان" : "listing quality"}`}
                  </span>
                </header>
                <h2>{posting.title}</h2>
                <p>{posting.description}</p>
                <div className="talent-flow__skills">
                  {posting.requiredSkills?.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
                <small>
                  {posting.organization?.name ??
                    posting.createdBy.profile?.displayName ??
                    (ar ? "صاحب إعلان مستقل" : "Independent employer")}{" "}
                  ·{" "}
                  {[posting.city, posting.countryCode]
                    .filter(Boolean)
                    .join(", ") ||
                    (ar ? "الموقع غير محدد" : "Location not specified")}
                </small>
                <strong>{salary(posting, locale)}</strong>
                <Link href={`/talent/job/sample?job=${posting.id}`}>
                  {ar ? "عرض الوظيفة" : "View job"}
                  <Icon name="arrow" />
                </Link>
              </article>
            ))}
          </section>
          {!visibleJobs.length ? <EmptyState locale={locale} /> : null}
          <section className="talent-job-applications" id="applications">
            <header>
              <div>
                <span>{ar ? "متابعة الطلبات" : "APPLICATION TRACKING"}</span>
                <h2>{ar ? "طلباتي الوظيفية" : "My job applications"}</h2>
              </div>
              <strong>{data.ownApplications.length}</strong>
            </header>
            <div>
              {data.ownApplications.map((application) => (
                <article key={application.id}>
                  <div className="talent-job-applications__score">
                    <strong>{application.matchScore}%</strong>
                    <small>{ar ? "مطابقة" : "match"}</small>
                  </div>
                  <div>
                    <h3>{application.jobPosting.title}</h3>
                    <p>
                      {application.jobPosting.organization?.name ??
                        application.jobPosting.createdBy.profile?.displayName ??
                        (ar ? "صاحب إعلان مستقل" : "Independent employer")}
                    </p>
                    <small>{formatDate(application.updatedAt, locale)}</small>
                  </div>
                  <Status locale={locale} value={application.status} />
                  <Link href={`/talent/apply/sample?job=${application.jobPosting.id}`}>
                    {ar ? "عرض التفاصيل" : "View details"}
                    <Icon name="arrow" />
                  </Link>
                </article>
              ))}
              {!data.ownApplications.length ? (
                <EmptyState
                  locale={locale}
                  message={ar ? "لم ترسل أي طلبات حتى الآن." : "You have not submitted any applications yet."}
                />
              ) : null}
            </div>
            <section className="talent-job-applications__interviews">
              <header>
                <Icon name="activity" />
                <h3>{ar ? "المقابلات والخطوات القادمة" : "Interviews and next steps"}</h3>
              </header>
              {data.ownApplications
                .filter((application) => application.status === "ACCEPTED")
                .map((application) => (
                  <article key={application.id}>
                    <div>
                      <strong>{application.jobPosting.title}</strong>
                      <small>
                        {ar
                          ? "انتقلت للمرحلة التالية؛ راجع المحادثة لتأكيد الموعد."
                          : "Advanced to the next stage; use the conversation to confirm timing."}
                      </small>
                    </div>
                    <Link href={`/talent/apply/sample?job=${application.jobPosting.id}`}>
                      {ar ? "عرض التفاصيل" : "View details"}
                    </Link>
                  </article>
                ))}
              {!data.ownApplications.some((application) => application.status === "ACCEPTED") ? (
                <p>{ar ? "لا توجد مقابلات أو مواعيد مؤكدة حاليًا." : "No interviews or confirmed times are available yet."}</p>
              ) : null}
            </section>
            <section className="talent-job-applications__saved">
              <header>
                <Icon name="shield" />
                <h3>{ar ? "الوظائف المحفوظة" : "Saved jobs"}</h3>
              </header>
              <p>
                {ar
                  ? "الحفظ غير متصل بقاعدة البيانات حاليًا، لذلك لن نعرض وظائف تجريبية."
                  : "Saving is not connected to persisted records yet, so no sample jobs are displayed."}
              </p>
              <button disabled type="button">{ar ? "غير متاح حاليًا" : "Currently unavailable"}</button>
            </section>
          </section>
        </>
      ) : null}

      {route.id === "job-detail" ? (
        selectedJob ? (
          <JobDetail locale={locale} posting={selectedJob}>
            <Link
              className="button button--primary"
              href={`/talent/apply/sample?job=${selectedJob.id}`}
            >
              {currentApplication
                ? ar
                  ? "عرض حالة الطلب"
                  : "View application status"
                : ar
                  ? "قدم الآن"
                  : "Apply now"}
            </Link>
          </JobDetail>
        ) : (
          <EmptyState locale={locale} />
        )
      ) : null}

      {route.id === "apply" ? (
        selectedJob ? (
          <section className="talent-apply">
            <JobDetail locale={locale} posting={selectedJob} />
            {selectedJob.createdById === data.viewerId ? (
              <EmptyState
                locale={locale}
                message={
                  ar
                    ? "لا يمكنك التقديم على إعلانك."
                    : "You cannot apply to your own posting."
                }
              />
            ) : currentApplication ? (
              <article className="talent-application-state">
                <Status locale={locale} value={currentApplication.status} />
                <h2>
                  {ar ? "تم إرسال طلبك" : "Your application was submitted"}
                </h2>
                <p>
                  {ar
                    ? `درجة المطابقة الأولية ${currentApplication.matchScore}%. القرار النهائي لصاحب العمل ولا توجد ضمانات توظيف.`
                    : `Initial match score: ${currentApplication.matchScore}%. The employer makes the final decision; employment is not guaranteed.`}
                </p>
                {["SUBMITTED", "UNDER_REVIEW"].includes(
                  currentApplication.status,
                ) ? (
                  <button
                    className="button button--ghost"
                    disabled={busy}
                    onClick={() =>
                      void runCommand(
                        {
                          action: "withdrawApplication",
                          applicationId: currentApplication.id,
                        },
                        ["تم سحب الطلب.", "Application withdrawn."],
                      )
                    }
                    type="button"
                  >
                    {ar ? "سحب الطلب" : "Withdraw application"}
                  </button>
                ) : null}
                <TalentConversation
                  applicationId={currentApplication.id}
                  busy={busy}
                  closed={["REJECTED", "WITHDRAWN"].includes(
                    currentApplication.status,
                  )}
                  currentUserId={data.viewerId}
                  locale={locale}
                  messages={currentApplication.messages}
                  runCommand={runCommand}
                />
              </article>
            ) : (
              <form className="talent-apply__form" onSubmit={submitApplication}>
                <h2>{ar ? "بيانات التقديم" : "Application details"}</h2>
                <textarea
                  name="applicationMessage"
                  minLength={20}
                  required
                  placeholder={
                    ar
                      ? "اربط خبرتك بالمهارات المطلوبة"
                      : "Connect your experience to the required skills"
                  }
                />
                {selectedJob.questions.length ? (
                  <fieldset className="talent-screening-questions">
                    <legend>
                      {ar
                        ? "أسئلة صاحب الإعلان"
                        : "Employer screening questions"}
                    </legend>
                    {selectedJob.questions.map((question) => (
                      <label key={question.id}>
                        <span>
                          {question.prompt}
                          {question.required ? " *" : ""}
                        </span>
                        <textarea
                          aria-label={question.prompt}
                          maxLength={2000}
                          name={`question-${question.id}`}
                          required={question.required}
                        />
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <label>
                  {ar ? "السيرة من Studio" : "CV from Studio"}
                  <select name="cvDocumentId">
                    <option value="">
                      {ar ? "بدون مرفق" : "No attachment"}
                    </option>
                    {data.talentProfile.cvDocuments.map((cv) => (
                      <option key={cv.id} value={cv.id}>
                        {cv.title} · v{cv.currentVersion}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="talent-consent">
                  <input name="shareProfile" required type="checkbox" />
                  {ar
                    ? "أوافق على مشاركة رسالتي وإجاباتي ونسخة من ملفي المهني مع صاحب هذا الإعلان فقط."
                    : "I consent to sharing my message, answers, and a profile snapshot with this posting's owner only."}
                </label>
                <button
                  className="button button--primary"
                  disabled={busy}
                  type="submit"
                >
                  {ar ? "إرسال الطلب" : "Submit application"}
                </button>
                <small>
                  {ar
                    ? "التقديم ودرجة المطابقة لا يضمنان التوظيف."
                    : "Applying and receiving a match score do not guarantee employment."}
                </small>
              </form>
            )}
          </section>
        ) : (
          <EmptyState locale={locale} />
        )
      ) : null}

      {route.id === "profile" ? (
        <>
          <ol className="talent-profile-steps">
            {[
              [ar ? "المعلومات الأساسية" : "Basic information", "1"],
              [ar ? "الخبرات والمهارات" : "Experience and skills", "2"],
              [ar ? "التعليم والشهادات" : "Education and certificates", "3"],
              [ar ? "روابط إضافية" : "Additional links", "4"],
              [ar ? "مراجعة وحفظ" : "Review and save", "5"],
            ].map(([label, step], index) => (
              <li className={index === 0 ? "is-active" : undefined} key={step}>
                <span>{step}</span>
                <strong>{label}</strong>
              </li>
            ))}
          </ol>
          <section className="talent-profile">
          <aside className="talent-profile__summary">
            <div className="talent-profile__avatar"><Icon name="user" /></div>
            <span>{ar ? "اكتمال الملف" : "Profile completion"}</span>
            <strong>{profileCompletion}%</strong>
            <i style={{ "--talent-profile-progress": `${profileCompletion}%` } as CSSProperties} />
            <h2>{profile?.headline ?? (ar ? "ملفك المهني يبدأ من هنا" : "Your professional profile starts here")}</h2>
            <p>
              {profile
                ? [profile.city, profile.countryCode, `${profile.yearsExperience} ${ar ? "سنوات خبرة" : "years experience"}`].filter(Boolean).join(" · ")
                : ar
                  ? "أضف بياناتك وخبرتك وسيرتك لتحسين ظهورك للفرص المناسبة."
                  : "Add your experience and CV to improve discovery for suitable roles."}
            </p>
            <div className="talent-profile__summary-signals">
              <span><Icon name="shield" />{profile?.isDiscoverable ? (ar ? "قابل للاكتشاف" : "Discoverable") : (ar ? "خاص" : "Private")}</span>
              <span><Icon name="briefcase" />{data.ownApplications.length} {ar ? "طلبات" : "applications"}</span>
              <span><Icon name="check" />{profile?.cvDocument ? (ar ? "CV مرتبط" : "CV linked") : (ar ? "CV غير مرتبط" : "No linked CV")}</span>
            </div>
          </aside>
          <form
            className="talent-profile__form"
            key={profile?.updatedAt ?? "new"}
            onSubmit={submitProfile}
          >
            <header>
              <div>
                <h2>{ar ? "ملفك المهني" : "Your professional profile"}</h2>
                <p>
                  {ar
                    ? "أنت تتحكم في الظهور ومشاركة CV لكل طلب."
                    : "You control discovery and CV sharing for every application."}
                </p>
              </div>
              <Link className="button button--ghost" href="/studio/cv">
                {ar ? "تحرير CV في Studio" : "Edit CV in Studio"}
              </Link>
            </header>
            <input
              defaultValue={profile?.headline ?? ""}
              name="headline"
              minLength={2}
              required
              placeholder={ar ? "العنوان المهني" : "Professional headline"}
            />
            <input
              defaultValue={profile?.city ?? ""}
              name="city"
              placeholder={ar ? "المدينة" : "City"}
            />
            <input
              defaultValue={profile?.countryCode ?? ""}
              maxLength={2}
              name="countryCode"
              placeholder={ar ? "الدولة" : "Country"}
            />
            <input
              defaultValue={profile?.yearsExperience ?? 0}
              min="0"
              max="80"
              name="yearsExperience"
              type="number"
              placeholder={ar ? "سنوات الخبرة" : "Years of experience"}
            />
            <input
              defaultValue={profile?.skills?.join(", ") ?? ""}
              name="skills"
              placeholder={
                ar ? "المهارات، مفصولة بفواصل" : "Skills, comma separated"
              }
            />
            <input
              defaultValue={profile?.availability ?? ""}
              name="availability"
              placeholder={ar ? "التوفر" : "Availability"}
            />
            <textarea
              defaultValue={profile?.summary ?? ""}
              name="summary"
              minLength={20}
              required
              placeholder={ar ? "نبذة مهنية" : "Professional summary"}
            />
            <textarea
              defaultValue={profile?.experience ?? ""}
              name="experience"
              placeholder={ar ? "الخبرة" : "Experience"}
            />
            <textarea
              defaultValue={profile?.education ?? ""}
              name="education"
              placeholder={ar ? "التعليم" : "Education"}
            />
            <label>
              {ar ? "ربط CV محفوظ" : "Link a saved CV"}
              <select
                defaultValue={profile?.cvDocumentId ?? ""}
                name="cvDocumentId"
              >
                <option value="">{ar ? "بدون CV" : "No CV"}</option>
                {data.talentProfile.cvDocuments.map((cv) => (
                  <option key={cv.id} value={cv.id}>
                    {cv.title} · v{cv.currentVersion}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>{ar ? "أنماط العمل" : "Work modes"}</legend>
              {["ON_SITE", "HYBRID", "REMOTE"].map((mode) => (
                <label key={mode}>
                  <input
                    defaultChecked={profile?.desiredWorkModes?.includes(mode)}
                    name="workMode"
                    type="checkbox"
                    value={mode}
                  />
                  {mode.replace("_", " ")}
                </label>
              ))}
            </fieldset>
            <label className="talent-consent">
              <input
                defaultChecked={profile?.isDiscoverable}
                name="isDiscoverable"
                type="checkbox"
              />
              {ar
                ? "إظهار ملخص ملفي دون البريد أو CV في بحث المواهب."
                : "Show my profile summary in talent search without email or CV."}
            </label>
            <button
              className="button button--primary"
              disabled={busy}
              type="submit"
            >
              {ar ? "حفظ الملف" : "Save profile"}
            </button>
          </form>
          <section className="talent-profile__applications">
            <h2>{ar ? "طلباتك" : "Your applications"}</h2>
            {data.ownApplications.map((application) => (
              <article key={application.id}>
                <div>
                  <strong>{application.jobPosting.title}</strong>
                  <small>
                    {application.jobPosting.organization?.name ??
                      application.jobPosting.createdBy.profile?.displayName ??
                      "—"}{" "}
                    · {formatDate(application.updatedAt, locale)}
                  </small>
                </div>
                <span>{application.matchScore}%</span>
                <Status locale={locale} value={application.status} />
                {["SUBMITTED", "UNDER_REVIEW"].includes(application.status) ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void runCommand(
                        {
                          action: "withdrawApplication",
                          applicationId: application.id,
                        },
                        ["تم سحب الطلب.", "Application withdrawn."],
                      )
                    }
                    type="button"
                  >
                    {ar ? "سحب" : "Withdraw"}
                  </button>
                ) : null}
              </article>
            ))}
            {!data.ownApplications.length ? (
              <EmptyState locale={locale} />
            ) : null}
          </section>
          </section>
        </>
      ) : null}

      {route.id === "employer" ? (
        <>
          <section className="talent-flow__signals">
            <article>
              <span>01</span>
              <strong>{ownedPostings.length}</strong>
              <small>{ar ? "إعلانات" : "Postings"}</small>
            </article>
            <article>
              <span>02</span>
              <strong>{data.applications.length}</strong>
              <small>{ar ? "متقدمون" : "Applicants"}</small>
            </article>
            <article>
              <span>03</span>
              <strong>
                {
                  data.applications.filter(
                    (application) => application.status === "UNDER_REVIEW",
                  ).length
                }
              </strong>
              <small>{ar ? "قيد المراجعة" : "Under review"}</small>
            </article>
            <article>
              <span>04</span>
              <strong>
                {
                  data.applications.filter(
                    (application) => application.status === "ACCEPTED",
                  ).length
                }
              </strong>
              <small>{ar ? "انتقلوا للمرحلة التالية" : "Advanced"}</small>
            </article>
          </section>
          <section className="talent-flow__entry">
            <Link href="/talent/employer/post">
              <Icon name="plus" />
              <div>
                <h2>{ar ? "نشر وظيفة" : "Post a job"}</h2>
                <p>
                  {ar
                    ? "وصف واضح مع بوابة جودة قبل النشر."
                    : "A clear description with a quality gate before publishing."}
                </p>
              </div>
              <Icon name="arrow" />
            </Link>
            <Link href="/talent/employer/applicants">
              <Icon name="people" />
              <div>
                <h2>{ar ? "إدارة المتقدمين" : "Manage applicants"}</h2>
                <p>
                  {ar
                    ? "مراحل وملاحظات ومطابقة مفسّرة."
                    : "Stages, notes, and explainable matching."}
                </p>
              </div>
              <Icon name="arrow" />
            </Link>
            <Link href="/talent/search">
              <Icon name="search" />
              <div>
                <h2>{ar ? "البحث عن مرشحين" : "Search talent"}</h2>
                <p>
                  {ar
                    ? "اكتشف الملفات التي وافق أصحابها على الظهور."
                    : "Discover profiles whose owners opted into visibility."}
                </p>
              </div>
              <Icon name="arrow" />
            </Link>
            <Link href="/talent/reports">
              <Icon name="barChart" />
              <div>
                <h2>{ar ? "أدوات وتقارير التوظيف" : "Hiring tools and reports"}</h2>
                <p>
                  {ar
                    ? "راقب مراحل المرشحين وصدّر تقريرًا موثوقًا."
                    : "Monitor candidate stages and export a reliable report."}
                </p>
              </div>
              <Icon name="arrow" />
            </Link>
          </section>
          <section className="talent-job-grid">
            {ownedPostings.map((posting) => (
              <article key={posting.id}>
                <header>
                  <Status locale={locale} value={posting.status} />
                  <span>{posting.qualityScore}/100</span>
                </header>
                <h2>{posting.title}</h2>
                <p>{posting.description}</p>
                <div className="talent-card-actions">
                  {posting.status === "DRAFT" ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void runCommand(
                          {
                            action: "updateStatus",
                            jobPostingId: posting.id,
                            status: "PUBLISHED",
                          },
                          ["تم نشر الإعلان.", "Posting published."],
                        )
                      }
                      type="button"
                    >
                      {ar ? "نشر" : "Publish"}
                    </button>
                  ) : null}
                  {posting.status === "PUBLISHED" ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void runCommand(
                          {
                            action: "updateStatus",
                            jobPostingId: posting.id,
                            status: "CLOSED",
                          },
                          ["تم إغلاق الإعلان.", "Posting closed."],
                        )
                      }
                      type="button"
                    >
                      {ar ? "إغلاق" : "Close"}
                    </button>
                  ) : null}
                  <Link href={`/talent/job/sample?job=${posting.id}`}>
                    {ar ? "عرض" : "View"}
                  </Link>
                </div>
              </article>
            ))}
          </section>
          {!ownedPostings.length ? <EmptyState locale={locale} /> : null}
        </>
      ) : null}

      {route.id === "employer-post" ? (
        <form className="talent-post-form" onSubmit={submitPosting}>
          <header>
            <h2>{ar ? "بيانات الوظيفة" : "Role details"}</h2>
            <p>
              {ar
                ? "يلزم بلوغ 55/100 في بوابة الجودة للنشر."
                : "A quality score of 55/100 is required before publishing."}
            </p>
          </header>
          <input
            name="title"
            minLength={2}
            required
            placeholder={ar ? "المسمى الوظيفي" : "Job title"}
          />
          <input name="department" placeholder={ar ? "القسم" : "Department"} />
          <select
            aria-label={ar ? "المنظمة" : "Organization"}
            name="organizationId"
          >
            <option value="">{ar ? "إعلان شخصي" : "Personal posting"}</option>
            {data.organizations
              .filter((membership) => membership.isOwner)
              .map((membership) => (
                <option
                  key={membership.organization.id}
                  value={membership.organization.id}
                >
                  {membership.organization.name}
                </option>
              ))}
          </select>
          <select aria-label={ar ? "نمط العمل" : "Work mode"} name="workMode">
            <option value="ON_SITE">ON SITE</option>
            <option value="HYBRID">HYBRID</option>
            <option value="REMOTE">REMOTE</option>
          </select>
          <input name="city" placeholder={ar ? "المدينة" : "City"} />
          <input
            maxLength={2}
            name="countryCode"
            placeholder={ar ? "الدولة" : "Country"}
          />
          <input
            name="salaryMin"
            min="0.01"
            step="0.01"
            type="number"
            placeholder={ar ? "الراتب من" : "Salary from"}
          />
          <input
            name="salaryMax"
            min="0.01"
            step="0.01"
            type="number"
            placeholder={ar ? "الراتب إلى" : "Salary to"}
          />
          <input
            name="requiredSkills"
            placeholder={ar ? "المهارات المطلوبة" : "Required skills"}
          />
          <textarea
            name="description"
            minLength={20}
            required
            placeholder={
              ar
                ? "المسؤوليات والمتطلبات"
                : "Responsibilities and requirements"
            }
          />
          <textarea name="benefits" placeholder={ar ? "المزايا" : "Benefits"} />
          <textarea name="conditions" placeholder={ar ? "الشروط" : "Conditions"} />
          <textarea
            name="screeningQuestions"
            placeholder={
              ar
                ? "أسئلة الفرز، سؤال واحد في كل سطر (حتى 5)"
                : "Screening questions, one per line (up to 5)"
            }
          />
          <button
            className="button button--primary"
            disabled={busy}
            type="submit"
          >
            {ar ? "حفظ مسودة" : "Save draft"}
          </button>
        </form>
      ) : null}

      {route.id === "employer-applicants" ? (
        <>
          <TalentApplicantFilters
            filters={applicantFilters}
            locale={locale}
            postings={ownedPostings}
            resultCount={visibleApplicants.length}
            setFilters={setApplicantFilters}
          />
          <section className="talent-applicant-list">
            {visibleApplicants.map((application) => (
              <ApplicantCard
                application={application}
                busy={busy}
                key={application.id}
                locale={locale}
                runCommand={runCommand}
              />
            ))}
            {!visibleApplicants.length ? <EmptyState locale={locale} /> : null}
          </section>
        </>
      ) : null}
      {route.id === "candidate" ? (
        selectedApplication ? (
          <CandidateDetail
            application={selectedApplication}
            busy={busy}
            locale={locale}
            runCommand={runCommand}
            viewerId={data.viewerId}
          />
        ) : (
          <EmptyState locale={locale} />
        )
      ) : null}

      {route.id === "search" ? (
        <>
          <TalentProfileFilters
            countries={talentCountries}
            filters={profileFilters}
            locale={locale}
            resultCount={visibleTalent.length}
            setFilters={setProfileFilters}
          />
          <section className="talent-profile-grid">
            {visibleTalent.map((candidate) => (
              <article key={candidate.id}>
                <span>
                  {candidate.yearsExperience} {ar ? "سنوات" : "years"}
                </span>
                <h2>
                  {candidate.user.profile?.displayName ??
                    (ar ? "مرشح" : "Candidate")}
                </h2>
                <strong>{candidate.headline}</strong>
                <p>{candidate.summary}</p>
                <div className="talent-flow__skills">
                  {candidate.skills?.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
                <small>
                  {[
                    candidate.city,
                    candidate.countryCode,
                    candidate.availability,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </article>
            ))}
          </section>
          {!visibleTalent.length ? (
            <EmptyState
              locale={locale}
              message={
                ar
                  ? "لا توجد ملفات تطابق الفلاتر أو اختارت الظهور العام حالياً."
                  : "No discoverable profiles match the current filters."
              }
            />
          ) : null}
        </>
      ) : null}

      {route.id === "matching" ? (
        <section className="talent-match-layout">
          <section>
            <header>
              <h2>
                {ar ? "وظائف مناسبة لملفك" : "Roles matching your profile"}
              </h2>
            </header>
            {data.matches.candidateMatches.map((match) => (
              <article key={match.posting.id}>
                <span>{match.score}%</span>
                <div>
                  <h3>{match.posting.title}</h3>
                  <p>
                    {ar ? "متطابق" : "Matched"}:{" "}
                    {match.signals.matchedSkills?.join(", ") || "—"}
                  </p>
                  <small>
                    {ar ? "الفجوات" : "Gaps"}:{" "}
                    {match.signals.missingSkills?.join(", ") ||
                      (ar ? "لا توجد فجوات مسجلة" : "No recorded gaps")}
                  </small>
                </div>
                <Link href={`/talent/job/sample?job=${match.posting.id}`}>
                  {ar ? "عرض" : "View"}
                </Link>
              </article>
            ))}
            {!data.matches.candidateMatches.length ? (
              <EmptyState
                locale={locale}
                message={
                  ar
                    ? "أكمل ملفك المهني لاحتساب المطابقة."
                    : "Complete your professional profile to calculate matches."
                }
              />
            ) : null}
          </section>
          <section>
            <header>
              <h2>
                {ar ? "مرشحون لإعلاناتك" : "Candidates for your postings"}
              </h2>
            </header>
            {data.matches.employerMatches.map((match) => (
              <article key={`${match.postingId}-${match.candidate.id}`}>
                <span>{match.score}%</span>
                <div>
                  <h3>
                    {match.candidate.user.profile?.displayName ??
                      match.candidate.headline}
                  </h3>
                  <p>{match.postingTitle}</p>
                  <small>
                    {match.signals.matchedSkills?.join(", ") || "—"}
                  </small>
                </div>
              </article>
            ))}
            {!data.matches.employerMatches.length ? (
              <EmptyState locale={locale} />
            ) : null}
          </section>
        </section>
      ) : null}

      {route.id === "reports" ? (
        <TalentReport data={data} locale={locale} />
      ) : null}
    </section>
  );
}

function JobDetail({
  children,
  locale,
  posting,
}: {
  children?: React.ReactNode;
  locale: Locale;
  posting: TalentPosting;
}) {
  const ar = locale === "ar";
  return (
    <article className="talent-job-detail">
      <header>
        <div>
          <Status locale={locale} value={posting.status} />
          <span>
            {ar ? "جودة الإعلان" : "Posting quality"} {posting.qualityScore}/100
          </span>
        </div>
        <h2>{posting.title}</h2>
        <p>
          {posting.organization?.name ??
            posting.createdBy.profile?.displayName ??
            (ar ? "صاحب إعلان مستقل" : "Independent employer")}
        </p>
      </header>
      <section>
        <div>
          <h3>{ar ? "الوصف" : "Description"}</h3>
          <p>{posting.description}</p>
        </div>
        <aside>
          <dl>
            <div>
              <dt>{ar ? "القسم" : "Department"}</dt>
              <dd>{posting.department ?? "—"}</dd>
            </div>
            <div>
              <dt>{ar ? "الموقع" : "Location"}</dt>
              <dd>
                {[posting.city, posting.countryCode]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </dd>
            </div>
            <div>
              <dt>{ar ? "نمط العمل" : "Work mode"}</dt>
              <dd>{posting.workMode.replace("_", " ")}</dd>
            </div>
            <div>
              <dt>{ar ? "النطاق المالي" : "Salary range"}</dt>
              <dd>{salary(posting, locale)}</dd>
            </div>
          </dl>
        </aside>
      </section>
      {posting.benefits || posting.conditions ? (
        <section className="talent-job-detail__terms">
          {posting.benefits ? (
            <div>
              <h3>{ar ? "المزايا" : "Benefits"}</h3>
              <p>{posting.benefits}</p>
            </div>
          ) : null}
          {posting.conditions ? (
            <div>
              <h3>{ar ? "الشروط" : "Conditions"}</h3>
              <p>{posting.conditions}</p>
            </div>
          ) : null}
        </section>
      ) : null}
      <div className="talent-flow__skills">
        {posting.requiredSkills?.map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>
      {children}
      <footer>
        <Icon name="shield" />
        {ar
          ? "هذه المنصة تساعد في المطابقة والتقديم ولا تضمن قرار التوظيف."
          : "This platform assists matching and applications; it does not guarantee a hiring decision."}
      </footer>
    </article>
  );
}

function ApplicantCard({
  application,
  busy,
  locale,
  runCommand,
}: {
  application: OwnedTalentApplication;
  busy: boolean;
  locale: Locale;
  runCommand: (
    command: TalentCommand,
    success: [string, string],
  ) => Promise<boolean>;
}) {
  const ar = locale === "ar";
  return (
    <article>
      <header>
        <div>
          <span>{application.matchScore}%</span>
          <h2>
            {application.applicant.profile?.displayName ??
              application.applicant.email}
          </h2>
          <p>{application.jobPosting.title}</p>
        </div>
        <Status locale={locale} value={application.status} />
      </header>
      <p>
        {application.message ??
          (ar ? "لا توجد رسالة." : "No application message.")}
      </p>
      <div className="talent-flow__skills">
        {application.matchSignals?.matchedSkills?.map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>
      <footer>
        <Link href={`/talent/candidate/sample?application=${application.id}`}>
          {ar ? "عرض المرشح" : "View candidate"}
          <Icon name="arrow" />
        </Link>
        {application.status === "SUBMITTED" ? (
          <button
            disabled={busy}
            onClick={() =>
              void runCommand(
                {
                  action: "updateApplicationStatus",
                  applicationId: application.id,
                  status: "UNDER_REVIEW",
                },
                ["بدأت مراجعة الطلب.", "Application moved to review."],
              )
            }
            type="button"
          >
            {ar ? "بدء المراجعة" : "Review"}
          </button>
        ) : null}
      </footer>
    </article>
  );
}

function CandidateDetail({
  application,
  busy,
  locale,
  runCommand,
  viewerId,
}: {
  application: OwnedTalentApplication;
  busy: boolean;
  locale: Locale;
  runCommand: (
    command: TalentCommand,
    success: [string, string],
  ) => Promise<boolean>;
  viewerId: string;
}) {
  const ar = locale === "ar";
  const snapshot = application.profileSnapshot;
  return (
    <article className="talent-candidate-detail">
      <header>
        <div>
          <span>{application.matchScore}%</span>
          <h2>
            {application.applicant.profile?.displayName ??
              application.applicant.email}
          </h2>
          <p>{application.jobPosting.title}</p>
        </div>
        <Status locale={locale} value={application.status} />
      </header>
      {snapshot ? (
        <section>
          <div>
            <h3>{snapshot.headline}</h3>
            <p>{snapshot.summary}</p>
            <dl>
              <div>
                <dt>{ar ? "الخبرة" : "Experience"}</dt>
                <dd>
                  {snapshot.yearsExperience ?? 0} {ar ? "سنوات" : "years"}
                </dd>
              </div>
              <div>
                <dt>{ar ? "الموقع" : "Location"}</dt>
                <dd>
                  {[snapshot.city, snapshot.countryCode]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </dd>
              </div>
              <div>
                <dt>{ar ? "التوفر" : "Availability"}</dt>
                <dd>{snapshot.availability ?? "—"}</dd>
              </div>
            </dl>
            <div className="talent-flow__skills">
              {snapshot.skills?.map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>
          </div>
          <aside>
            <h3>{ar ? "المطابقة" : "Match evidence"}</h3>
            <p>
              {ar ? "مهارات متطابقة" : "Matched skills"}:{" "}
              {application.matchSignals?.matchedSkills?.join(", ") || "—"}
            </p>
            <p>
              {ar ? "فجوات" : "Gaps"}:{" "}
              {application.matchSignals?.missingSkills?.join(", ") || "—"}
            </p>
            {application.cvDocument ? (
              <div>
                <strong>{ar ? "CV مشترك" : "Shared CV"}</strong>
                <span>
                  {application.cvDocument.title} · v
                  {application.cvDocument.currentVersion}
                </span>
              </div>
            ) : null}
          </aside>
        </section>
      ) : (
        <EmptyState
          locale={locale}
          message={
            ar
              ? "لم يوافق المرشح على مشاركة ملفه المهني؛ تظهر رسالة التقديم فقط."
              : "The candidate did not consent to share a profile; only the application message is visible."
          }
        />
      )}
      {application.answers.length ? (
        <section className="talent-candidate-answers">
          <h3>{ar ? "إجابات أسئلة الفرز" : "Screening answers"}</h3>
          {application.answers.map((answer) => (
            <article key={answer.id}>
              <strong>{answer.promptSnapshot}</strong>
              <p>{answer.answer}</p>
            </article>
          ))}
        </section>
      ) : null}
      <TalentConversation
        applicationId={application.id}
        busy={busy}
        closed={["REJECTED", "WITHDRAWN"].includes(application.status)}
        currentUserId={viewerId}
        locale={locale}
        messages={application.messages}
        runCommand={runCommand}
      />
      <textarea
        aria-label={ar ? "ملاحظات صاحب العمل" : "Employer notes"}
        defaultValue={application.employerNotes ?? ""}
        id={`notes-${application.id}`}
        placeholder={ar ? "ملاحظات داخلية" : "Internal notes"}
      />
      <footer>
        {application.status === "SUBMITTED" ? (
          <button
            disabled={busy}
            onClick={() =>
              void runCommand(
                {
                  action: "updateApplicationStatus",
                  applicationId: application.id,
                  status: "UNDER_REVIEW",
                  employerNotes: (
                    document.getElementById(
                      `notes-${application.id}`,
                    ) as HTMLTextAreaElement
                  )?.value,
                },
                ["بدأت المراجعة.", "Review started."],
              )
            }
            type="button"
          >
            {ar ? "بدء المراجعة" : "Start review"}
          </button>
        ) : null}
        {application.status === "UNDER_REVIEW" ? (
          <>
            <button
              disabled={busy}
              onClick={() =>
                void runCommand(
                  {
                    action: "updateApplicationStatus",
                    applicationId: application.id,
                    status: "ACCEPTED",
                    employerNotes: (
                      document.getElementById(
                        `notes-${application.id}`,
                      ) as HTMLTextAreaElement
                    )?.value,
                  },
                  [
                    "انتقل المرشح للمرحلة التالية دون ضمان توظيف.",
                    "Candidate advanced to the next stage without an employment guarantee.",
                  ],
                )
              }
              type="button"
            >
              {ar ? "انتقال للمرحلة التالية" : "Advance candidate"}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void runCommand(
                  {
                    action: "updateApplicationStatus",
                    applicationId: application.id,
                    status: "REJECTED",
                    employerNotes: (
                      document.getElementById(
                        `notes-${application.id}`,
                      ) as HTMLTextAreaElement
                    )?.value,
                  },
                  ["تم إغلاق الطلب.", "Application closed."],
                )
              }
              type="button"
            >
              {ar ? "رفض" : "Reject"}
            </button>
          </>
        ) : null}
      </footer>
    </article>
  );
}

function TalentReport({
  data,
  locale,
}: {
  data: TalentPayload;
  locale: Locale;
}) {
  const ar = locale === "ar";
  const accepted = data.applications.filter(
    (application) => application.status === "ACCEPTED",
  );
  const averageMatch = data.applications.length
    ? Math.round(
        data.applications.reduce(
          (total, application) => total + application.matchScore,
          0,
        ) / data.applications.length,
      )
    : 0;
  const averageDecisionDays = accepted.length
    ? Math.round(
        accepted.reduce(
          (total, application) =>
            total +
            Math.max(
              0,
              new Date(application.updatedAt).getTime() -
                new Date(application.createdAt).getTime(),
            ),
          0,
        ) /
          accepted.length /
          86_400_000,
      )
    : null;
  const ownedPostings = data.postings.filter(
    (posting) => posting.createdById === data.viewerId,
  );
  const maxPipeline = Math.max(
    1,
    ...["SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"].map(
      (status) =>
        data.applications.filter((application) => application.status === status)
          .length,
    ),
  );
  async function downloadExcel() {
    const response = await fetch("/api/talent/report", { cache: "no-store" });
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const download = document.createElement("a");
    download.href = url;
    download.download =
      response.headers
        .get("content-disposition")
        ?.match(/filename="([^"]+)"/)?.[1] ?? "jenan-talent-report.xlsx";
    download.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="talent-report studio-print-area">
      <header>
        <div>
          <span>JENAN PRO · HIRING REPORT</span>
          <h2>{ar ? "تقرير التوظيف" : "Hiring report"}</h2>
          <p>
            {new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", {
              dateStyle: "long",
            }).format(new Date())}
          </p>
        </div>
        <div>
          <button onClick={() => void downloadExcel()} type="button">
            Excel
          </button>
          <button
            className="button button--primary"
            onClick={() => window.print()}
            type="button"
          >
            {ar ? "طباعة / PDF" : "Print / PDF"}
          </button>
        </div>
      </header>
      <section className="talent-report__source">
        <strong>
          {ar
            ? "المصدر: إعلاناتك وطلبات المتقدمين الحالية"
            : "Source: your current postings and applicant records"}
        </strong>
        <span>
          {ar
            ? "القبول انتقال في مسار التوظيف وليس عقدًا أو ضمانًا للتوظيف. زمن القرار يقاس من إرسال الطلب حتى آخر تحديث للطلبات المقبولة."
            : "Acceptance advances the hiring workflow; it is not a contract or employment guarantee. Decision time is measured from submission to the latest update for accepted applications."}
        </span>
      </section>
      <section className="talent-flow__signals">
        <article>
          <span>01</span>
          <strong>
            {
              ownedPostings.filter((posting) => posting.status === "PUBLISHED")
                .length
            }
          </strong>
          <small>{ar ? "وظائف منشورة" : "Published roles"}</small>
        </article>
        <article>
          <span>02</span>
          <strong>{data.applications.length}</strong>
          <small>{ar ? "متقدمون" : "Applicants"}</small>
        </article>
        <article>
          <span>03</span>
          <strong>{averageMatch}%</strong>
          <small>{ar ? "متوسط المطابقة" : "Average match"}</small>
        </article>
        <article>
          <span>04</span>
          <strong>{averageDecisionDays ?? "—"}</strong>
          <small>{ar ? "أيام للقرار" : "Days to decision"}</small>
        </article>
      </section>
      <div className="talent-report__pipeline">
        {["SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"].map(
          (status) => {
            const count = data.applications.filter(
              (application) => application.status === status,
            ).length;
            return (
              <article key={status}>
                <Status locale={locale} value={status} />
                <i
                  style={
                    {
                      "--talent-pipeline": `${Math.max(count ? 8 : 0, (count / maxPipeline) * 100)}%`,
                    } as React.CSSProperties
                  }
                />
                <strong>{count}</strong>
              </article>
            );
          },
        )}
      </div>
      <section className="talent-report__postings">
        <header>
          <h3>{ar ? "أداء الإعلانات" : "Posting performance"}</h3>
          <small>
            {ownedPostings.length} {ar ? "إعلانات" : "postings"}
          </small>
        </header>
        <div className="software-table-wrap">
          <table className="software-table">
            <thead>
              <tr>
                <th>{ar ? "الوظيفة" : "Posting"}</th>
                <th>{ar ? "الحالة" : "Status"}</th>
                <th>{ar ? "الجودة" : "Quality"}</th>
                <th>{ar ? "المتقدمون" : "Applicants"}</th>
                <th>{ar ? "متوسط المطابقة" : "Average match"}</th>
                <th>{ar ? "آخر تحديث" : "Updated"}</th>
              </tr>
            </thead>
            <tbody>
              {ownedPostings.map((posting) => {
                const applications = data.applications.filter(
                  (application) => application.jobPosting.id === posting.id,
                );
                const match = applications.length
                  ? Math.round(
                      applications.reduce(
                        (total, application) => total + application.matchScore,
                        0,
                      ) / applications.length,
                    )
                  : null;
                return (
                  <tr key={posting.id}>
                    <td>{posting.title}</td>
                    <td>
                      <Status locale={locale} value={posting.status} />
                    </td>
                    <td>{posting.qualityScore}/100</td>
                    <td>{applications.length}</td>
                    <td>{match === null ? "—" : `${match}%`}</td>
                    <td>{formatDate(posting.updatedAt, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {accepted.length ? (
        <section className="talent-report__decisions">
          <h3>{ar ? "زمن قرارات القبول" : "Accepted decision time"}</h3>
          {accepted.map((application) => {
            const days = Math.max(
              0,
              Math.round(
                (new Date(application.updatedAt).getTime() -
                  new Date(application.createdAt).getTime()) /
                  86_400_000,
              ),
            );
            return (
              <article key={application.id}>
                <span>{application.jobPosting.title}</span>
                <i
                  style={
                    {
                      "--talent-decision": `${Math.max(4, Math.min(100, (days / Math.max(averageDecisionDays ?? 1, 1)) * 50))}%`,
                    } as React.CSSProperties
                  }
                />
                <strong>
                  {days} {ar ? "يوم" : "days"}
                </strong>
              </article>
            );
          })}
        </section>
      ) : null}
      <footer>
        {ar
          ? "المصدر: الإعلانات والطلبات الحالية. راجع الامتثال المحلي وسياسة الاحتفاظ قبل الاستخدام الرسمي."
          : "Source: current postings and applications. Review local compliance and retention policy before formal use."}
      </footer>
    </section>
  );
}
