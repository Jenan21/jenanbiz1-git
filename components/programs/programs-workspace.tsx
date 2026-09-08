"use client";

import Link from "next/link";
import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type ProgramKey = "FINANCE" | "PEOPLE" | "FIELD_OPERATIONS" | "FLEET";
type ProgramStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
type OrganizationProgram = { id: string; key: ProgramKey; status: ProgramStatus };
type Organization = { id: string; name: string; businessPrograms: OrganizationProgram[] };

const programs: Array<{ key: ProgramKey; ar: string; en: string; arDescription: string; enDescription: string }> = [
  { key: "FINANCE", ar: "العمليات المالية", en: "Financial operations", arDescription: "سجل تشغيلي للتقارير والعمليات المالية.", enDescription: "An operational record for financial reporting and activity." },
  { key: "PEOPLE", ar: "إدارة الأفراد", en: "People operations", arDescription: "إدارة الفرق والأدوار والعمليات البشرية.", enDescription: "Manage teams, roles, and people operations." },
  { key: "FIELD_OPERATIONS", ar: "العمليات الميدانية", en: "Field operations", arDescription: "تتبع فرق الميدان والتكليفات والنشاط.", enDescription: "Track field teams, assignments, and activity." },
  { key: "FLEET", ar: "إدارة الأسطول", en: "Fleet management", arDescription: "إدارة المركبات والمسارات والتوافر.", enDescription: "Manage vehicles, routes, and availability." },
];

export function ProgramsWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/programs", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { organizations?: Array<{ organization: Organization }>; message?: string } | null;
    if (response.ok && payload?.organizations) {
      const nextOrganizations = payload.organizations.map(({ organization }) => organization);
      setOrganizations(nextOrganizations);
      setOrganizationId((current) => nextOrganizations.some((organization) => organization.id === current) ? current : (nextOrganizations[0]?.id ?? ""));
    } else setMessage(payload?.message ?? (ar ? "تعذر تحميل برامج المنشآت." : "Organization programs could not be loaded."));
    setLoading(false);
  }

  const loadOnMount = useEffectEvent(() => { void load(); });

  useEffect(() => {
    const timeout = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function submit(command: Record<string, unknown>) {
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/programs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    if (response.ok) await load();
    else setMessage(payload?.message ?? (ar ? "تعذر حفظ التغيير." : "The change could not be saved."));
    setSubmitting(false);
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit({ action: "createOrganization", name: organizationName });
    setOrganizationName("");
  }

  const selectedOrganization = organizations.find((organization) => organization.id === organizationId);
  return (
    <section className="programs-workspace" aria-busy={loading}>
      <header className="programs-workspace__header">
        <div>
          <span className="eyebrow eyebrow--small">JENAN PROGRAMS</span>
          <h1>{ar ? "برامج جنان للمنشآت" : "Jenan organization programs"}</h1>
          <p>{ar ? "فعّل وحدات العمل لمنشأتك وأدر حالتها من حساب الأعضاء المخولين." : "Activate operational modules for your organization and manage their status through authorized members."}</p>
        </div>
        <button className="button button--secondary" onClick={() => void load()} type="button">{ar ? "تحديث" : "Refresh"}</button>
      </header>

      <form className="programs-create" onSubmit={createOrganization}>
        <label htmlFor="organization-name">{ar ? "إنشاء منشأة" : "Create organization"}</label>
        <input id="organization-name" required minLength={2} maxLength={160} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder={ar ? "اسم المنشأة" : "Organization name"} />
        <button className="button button--primary" disabled={submitting} type="submit">{ar ? "إنشاء" : "Create"}</button>
      </form>

      {organizations.length ? <label className="programs-organization">{ar ? "المنشأة النشطة" : "Active organization"}<select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label> : null}
      {message ? <p className="programs-message" role="status">{message}</p> : null}
      <div className="programs-grid">
        {programs.map((definition) => {
          const activeProgram = selectedOrganization?.businessPrograms.find((program) => program.key === definition.key);
          return <article className="program-card" key={definition.key}>
            <span>{activeProgram?.status === "ACTIVE" ? (ar ? "نشط" : "Active") : (ar ? "غير مفعّل" : "Not activated")}</span>
            <h2>{ar ? definition.ar : definition.en}</h2>
            <p>{ar ? definition.arDescription : definition.enDescription}</p>
            {activeProgram?.status === "ACTIVE" ? <div className="program-card__actions">{definition.key === "FINANCE" ? <Link className="button button--primary" href="/programs/finance">{ar ? "فتح الدفتر المالي" : "Open financial ledger"}</Link> : null}{definition.key === "PEOPLE" ? <Link className="button button--primary" href="/programs/people">{ar ? "إدارة الفريق" : "Manage team"}</Link> : null}{definition.key === "FIELD_OPERATIONS" ? <Link className="button button--primary" href="/programs/field">{ar ? "فتح لوحة الميدان" : "Open field board"}</Link> : null}{definition.key === "FLEET" ? <Link className="button button--primary" href="/programs/fleet">{ar ? "إدارة المركبات" : "Manage vehicles"}</Link> : null}<button className="button button--secondary" disabled={submitting} onClick={() => void submit({ action: "updateStatus", organizationId, programId: activeProgram.id, status: "SUSPENDED" })} type="button">{ar ? "تعليق" : "Suspend"}</button></div> : <button className="button button--primary" disabled={submitting || !organizationId} onClick={() => void submit({ action: "activate", organizationId, key: definition.key })} type="button">{ar ? "تفعيل البرنامج" : "Activate program"}</button>}
          </article>;
        })}
      </div>
    </section>
  );
}