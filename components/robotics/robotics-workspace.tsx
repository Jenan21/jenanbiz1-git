"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import type { PublicRobot, RoboticsPayload } from "@/components/robotics/robotics-types";
import { Icon } from "@/components/ui/icons";
import { ROBOTICS_FLOW_ROUTES, type RoboticsFlowRoute } from "@/lib/robotics/robotics-routes";
import type { Locale } from "@/types/i18n";

const descriptions: Record<RoboticsFlowRoute["id"], [string, string]> = {
  dashboard: ["استكشف روبوتات تشغيلية معتمدة بملفات عامة آمنة.", "Explore operational robots through safe, verified public profiles."],
  search: ["صف المهمة والقطاع والموقع والبيئة للحصول على مطابقة مفسّرة.", "Describe the task, sector, location, and environment for explainable matching."],
  results: ["نتائج مرتبة حسب المعايير والجاهزية الأكاديمية المعلنة.", "Results ranked by your criteria and published academic readiness."],
  item: ["مواصفات عامة وشهادات ومهارات دون بيانات تشغيل إدارية.", "Public specifications, certifications, and skills without administrative operations data."],
  recommendations: ["مقارنة الخيارات والأسباب والفجوات وحدود التسعير المتاح.", "Compare options, reasons, gaps, and available pricing limitations."],
};

function pick(copy: readonly [string, string], locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

function verifiedDate(robot: PublicRobot, locale: Locale) {
  const value = robot.academicProfile?.lastVerifiedAt;
  return value ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { dateStyle: "medium" }).format(new Date(value)) : locale === "ar" ? "غير متاح" : "Unavailable";
}

function RobotCard({ locale, robot }: { locale: Locale; robot: PublicRobot }) {
  const ar = locale === "ar";
  return <article className="robotics-card"><header><span>{robot.academicProfile?.status}</span><strong>{robot.academicProfile?.trustScore ?? 0}% {ar ? "ثقة" : "trust"}</strong></header><h2>{robot.name}</h2><p>{robot.academicProfile?.primarySpecialization?.name ?? (ar ? "التخصص غير معلن" : "Specialization unavailable")}</p><div>{robot.academicProfile?.skills.slice(0, 4).map((skill) => <small key={skill.skill.name}>{skill.skill.name} · {skill.level}</small>)}</div><dl><div><dt>{ar ? "الجودة" : "Quality"}</dt><dd>{robot.academicProfile?.qualityScore ?? 0}</dd></div><div><dt>{ar ? "السلامة" : "Safety"}</dt><dd>{robot.academicProfile?.safetyScore ?? 0}</dd></div><div><dt>{ar ? "الاعتمادات" : "Certificates"}</dt><dd>{robot.academicProfile?.certifications.length ?? 0}</dd></div></dl><Link href={`/robotics/item/sample?robot=${robot.id}`}>{ar ? "عرض المواصفات" : "View specifications"}<Icon name="arrow" /></Link></article>;
}

export function RoboticsWorkspace({ criteria, locale, robotId, route }: { criteria?: { environment?: string; location?: string; query?: string; sector?: string; budget?: string }; locale: Locale; robotId?: string; route: RoboticsFlowRoute }) {
  const ar = locale === "ar";
  const router = useRouter();
  const [data, setData] = useState<RoboticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      if (criteria?.query) params.set("query", criteria.query);
      if (criteria?.sector) params.set("sector", criteria.sector);
      if (criteria?.location) params.set("location", criteria.location);
      if (criteria?.environment) params.set("environment", criteria.environment);
      if (criteria?.budget) params.set("budgetMinor", String(Math.round(Number(criteria.budget) * 100)));
      const response = await fetch(`/api/robotics?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as RoboticsPayload | null;
      if (!active) return;
      if (response.ok && payload) setData(payload);
      else setMessage(payload?.message ?? (ar ? "تعذر تحميل كتالوج Robotics." : "Robotics catalog could not be loaded."));
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [ar, criteria?.budget, criteria?.environment, criteria?.location, criteria?.query, criteria?.sector, refreshVersion]);

  const selected = data?.robots.find((robot) => robot.id === robotId) ?? data?.recommendations[0]?.robot ?? data?.robots[0];
  const specializations = new Set(data?.robots.map((robot) => robot.academicProfile?.primarySpecialization?.name).filter(Boolean)).size;
  const countries = new Set(data?.robots.flatMap((robot) => robot.academicProfile?.geographyProfiles.map((profile) => profile.geographyNode.code ?? profile.geographyNode.name) ?? [])).size;

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["query", "sector", "location", "environment", "budget"]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    router.push(`/robotics/results?${params.toString()}`);
  }

  async function requestInformation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const form = event.currentTarget; const values = new FormData(form);
    setBusy(true); setMessage("");
    const budget = String(values.get("budget") ?? "").trim();
    const response = await fetch("/api/robotics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "requestInformation", robotId: selected.id, task: String(values.get("task") ?? ""), sector: String(values.get("sector") ?? "") || undefined, location: String(values.get("location") ?? "") || undefined, environment: String(values.get("environment") ?? "") || undefined, budgetMinor: budget ? Math.round(Number(budget) * 100) : undefined }) });
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    if (response.ok) {
      setMessage(ar ? "تم تسجيل طلب المعلومات. لم يتم تشغيل أي روبوت أو إنشاء تكلفة." : "Information request recorded. No robot was executed and no cost was created.");
      form.reset(); setRefreshVersion((value) => value + 1);
    } else setMessage(payload?.message ?? (ar ? "تعذر تسجيل الطلب." : "The request could not be recorded."));
    setBusy(false);
  }

  if (loading || !data) return <section className="robotics-flow" data-robotics-access="INFORMATION_ONLY" data-robotics-privacy="SANITIZED_PUBLIC_PROFILE" data-robotics-route={route.route} data-robotics-screen={route.id} data-robotics-source="LOADING"><header className="robotics-flow__hero"><div><span>JENAN ROBOTICS</span><h1>{pick(route.title, locale)}</h1><p>{pick(descriptions[route.id], locale)}</p></div></header><div className="robotics-flow__loading"><span />{ar ? "جارٍ تحميل الكتالوج..." : "Loading catalog..."}</div></section>;

  return <section className="robotics-flow" data-robotics-access="INFORMATION_ONLY" data-robotics-privacy="SANITIZED_PUBLIC_PROFILE" data-robotics-route={route.route} data-robotics-screen={route.id} data-robotics-source="CERTIFIED_OPERATIONAL_PROFILES">
    <nav className="robotics-flow__nav" aria-label={ar ? "مسارات Robotics" : "Robotics routes"}>{ROBOTICS_FLOW_ROUTES.map((definition, index) => <Link aria-current={definition.id === route.id ? "page" : undefined} className={definition.id === route.id ? "is-active" : ""} href={definition.route} key={definition.id}><span>{String(index + 1).padStart(2, "0")}</span>{pick(definition.title, locale)}</Link>)}</nav>
    <header className="robotics-flow__hero"><div><span>JENAN ROBOTICS · {route.id.toUpperCase()}</span><h1>{pick(route.title, locale)}</h1><p>{pick(descriptions[route.id], locale)}</p></div><div className="robotics-flow__guard"><Icon name="shield" /><strong>{ar ? "واجهة معلومات فقط" : "Information-only access"}</strong><small>{ar ? "التنفيذ والتكاليف محمية إدارياً" : "Execution and costs remain admin-controlled"}</small></div></header>
    {message ? <p className="robotics-flow__message" role="status">{message}</p> : null}

    {route.id === "dashboard" ? <><section className="robotics-flow__signals"><article><span>01</span><strong>{data.robots.length}</strong><small>{ar ? "روبوتات عامة جاهزة" : "Public ready robots"}</small></article><article><span>02</span><strong>{specializations}</strong><small>{ar ? "تخصصات معلنة" : "Published specializations"}</small></article><article><span>03</span><strong>{countries}</strong><small>{ar ? "نطاقات جغرافية" : "Geographic scopes"}</small></article><article><span>04</span><strong>{data.requests.length}</strong><small>{ar ? "طلبات معلومات" : "Information requests"}</small></article></section><section className="robotics-flow__entry"><Link href="/robotics/search"><Icon name="search" /><div><h2>{ar ? "ابحث عن روبوت" : "Find a robot"}</h2><p>{ar ? "ابدأ من المهمة والقطاع والبيئة." : "Start with the task, sector, and environment."}</p></div><Icon name="arrow" /></Link><Link href="/robotics/recommendations"><Icon name="sparkles" /><div><h2>{ar ? "التوصيات" : "Recommendations"}</h2><p>{ar ? "قارن الأسباب والفجوات والاعتمادات." : "Compare reasons, gaps, and certifications."}</p></div><Icon name="arrow" /></Link></section><section className="robotics-flow__requests"><header><h2>{ar ? "طلباتك الأخيرة" : "Recent requests"}</h2></header>{data.requests.map((request) => <article key={request.id}><div><strong>{request.robot.name}</strong><small>{request.task}</small></div><Status value={request.status} /></article>)}{!data.requests.length ? <Empty locale={locale} /> : null}</section></> : null}

    {route.id === "search" ? <form className="robotics-search" onSubmit={search}><header><h2>{ar ? "وصف الاحتياج" : "Describe your need"}</h2><p>{ar ? "لن ينتج البحث سعراً أو قدرة غير موثقة." : "Search will not infer unverified price or capability."}</p></header><textarea name="query" minLength={2} required placeholder={ar ? "المهمة المطلوبة" : "Required task"} /><input name="sector" placeholder={ar ? "القطاع" : "Sector"} /><input name="location" placeholder={ar ? "الموقع" : "Location"} /><input name="environment" placeholder={ar ? "بيئة التشغيل" : "Operating environment"} /><input name="budget" min="0" step="0.01" type="number" placeholder={ar ? "الميزانية الاختيارية" : "Optional budget"} /><button className="button button--primary" type="submit"><Icon name="search" />{ar ? "بحث" : "Search"}</button></form> : null}

    {route.id === "results" ? <><section className="robotics-result-summary"><strong>{data.robots.length}</strong><span>{ar ? "نتائج مطابقة للمعايير" : "results match the criteria"}</span><Link href={`/robotics/recommendations?${new URLSearchParams(Object.entries(criteria ?? {}).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString()}`}>{ar ? "مقارنة التوصيات" : "Compare recommendations"}</Link></section><section className="robotics-grid">{data.robots.map((robot) => <RobotCard key={robot.id} locale={locale} robot={robot} />)}</section>{!data.robots.length ? <Empty locale={locale} message={ar ? "لا توجد مطابقة منشورة. غيّر المعايير دون افتراض توفر غير موثّق." : "No published match. Adjust criteria without assuming unavailable capability."} /> : null}</> : null}

    {route.id === "item" ? selected ? <article className="robotics-detail"><header><div><Status value={selected.academicProfile?.status ?? "UNAVAILABLE"} /><span>{ar ? "آخر تحقق" : "Last verified"}: {verifiedDate(selected, locale)}</span></div><h2>{selected.name}</h2><p>{selected.academicProfile?.primarySpecialization?.description ?? (ar ? "لا يوجد وصف تخصص منشور." : "No published specialization description.")}</p></header><section className="robotics-detail__metrics"><article><span>{ar ? "الجودة" : "Quality"}</span><strong>{selected.academicProfile?.qualityScore ?? 0}</strong></article><article><span>{ar ? "الموثوقية" : "Reliability"}</span><strong>{selected.academicProfile?.reliabilityScore ?? 0}</strong></article><article><span>{ar ? "السلامة" : "Safety"}</span><strong>{selected.academicProfile?.safetyScore ?? 0}</strong></article><article><span>{ar ? "الثقة" : "Trust"}</span><strong>{selected.academicProfile?.trustScore ?? 0}</strong></article></section><div className="robotics-detail__grid"><section><h3>{ar ? "المهارات" : "Skills"}</h3>{selected.academicProfile?.skills.map((skill) => <article key={skill.skill.name}><strong>{skill.skill.name}</strong><span>{skill.level}</span><p>{skill.skill.description ?? "—"}</p></article>)}{!selected.academicProfile?.skills.length ? <Empty locale={locale} /> : null}</section><section><h3>{ar ? "الشهادات والجغرافيا" : "Certifications and geography"}</h3>{selected.academicProfile?.certifications.map((certificate) => <article key={certificate.certification.name}><strong>{certificate.certification.name}</strong><span>{certificate.status}</span></article>)}{selected.academicProfile?.geographyProfiles.map((profile) => <article key={profile.geographyNode.name}><strong>{profile.geographyNode.name}</strong><span>{profile.proficiency} · {profile.language ?? "—"}</span></article>)}</section></div><form className="robotics-request" onSubmit={requestInformation}><h3>{ar ? "طلب معلومات" : "Request information"}</h3><textarea name="task" minLength={10} required placeholder={ar ? "صف المهمة أو حالة الاستخدام" : "Describe the task or use case"} /><input name="sector" placeholder={ar ? "القطاع" : "Sector"} /><input name="location" placeholder={ar ? "الموقع" : "Location"} /><input name="environment" placeholder={ar ? "البيئة" : "Environment"} /><input name="budget" min="0" step="0.01" type="number" placeholder={ar ? "الميزانية الاختيارية" : "Optional budget"} /><button className="button button--primary" disabled={busy} type="submit">{ar ? "إرسال طلب المعلومات" : "Send information request"}</button><small>{ar ? "لا يشغل هذا الإجراء الروبوت ولا ينشئ تكلفة." : "This action does not execute the robot or create a cost."}</small></form></article> : <Empty locale={locale} /> : null}

    {route.id === "recommendations" ? <section className="robotics-recommendations">{data.recommendations.slice(0, 5).map((recommendation, index) => <article key={recommendation.robot.id}><header><span>#{index + 1}</span><strong>{recommendation.score}%</strong></header><h2>{recommendation.robot.name}</h2><p>{recommendation.robot.academicProfile?.primarySpecialization?.name ?? "—"}</p><div><strong>{ar ? "أسباب المطابقة" : "Match reasons"}</strong><span>{recommendation.reasons.join(" · ") || (ar ? "الجاهزية الأكاديمية فقط" : "Academic readiness only")}</span></div><div><strong>{ar ? "الفجوات" : "Gaps"}</strong><span>{recommendation.gaps.join(" · ") || (ar ? "لا توجد فجوات في المعايير المدخلة" : "No gaps in supplied criteria")}</span></div><div><strong>{ar ? "الميزانية" : "Budget"}</strong><span>{recommendation.budgetCompatibility === "UNAVAILABLE" ? (ar ? "التوافق السعري غير متاح" : "Pricing compatibility unavailable") : (ar ? "لم تُدخل ميزانية" : "No budget supplied")}</span></div><Link href={`/robotics/item/sample?robot=${recommendation.robot.id}`}>{ar ? "عرض" : "View"}<Icon name="arrow" /></Link></article>)}{!data.recommendations.length ? <Empty locale={locale} /> : null}</section> : null}
  </section>;
}

function Status({ value }: { value: string }) {
  return <span className={`robotics-flow__status robotics-flow__status--${value.toLowerCase()}`}>{value.replaceAll("_", " ")}</span>;
}

function Empty({ locale, message }: { locale: Locale; message?: string }) {
  return <div className="robotics-flow__empty"><Icon name="activity" /><p>{message ?? (locale === "ar" ? "لا توجد بيانات عامة متاحة." : "No public data is available.")}</p></div>;
}