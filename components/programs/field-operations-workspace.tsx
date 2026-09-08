"use client";

import Link from "next/link";
import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Organization = { id: string; name: string; businessPrograms: Array<{ key: string; status: string }> };
type Member = { id: string; user: { email: string; profile: { displayName: string | null } | null } };
type Assignment = { id: string; title: string; description: string | null; status: "ACTIVE" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"; dueAt: string | null; assigneeMember: Member | null };

export function FieldOperationsWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeMemberId, setAssigneeMemberId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true); setMessage("");
    const response = await fetch("/api/programs", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { organizations?: Array<{ organization: Organization }>; message?: string } | null;
    if (!response.ok || !payload?.organizations) { setMessage(payload?.message ?? (ar ? "تعذر تحميل المنشآت." : "Organizations could not be loaded.")); setLoading(false); return; }
    const nextOrganizations = payload.organizations.map(({ organization }) => organization).filter((organization) => organization.businessPrograms.some((program) => program.key === "FIELD_OPERATIONS" && program.status === "ACTIVE"));
    const nextId = nextOrganizations.some((organization) => organization.id === organizationId) ? organizationId : (nextOrganizations[0]?.id ?? "");
    setOrganizations(nextOrganizations); setOrganizationId(nextId);
    if (nextId) {
      const assignmentsResponse = await fetch(`/api/programs/field?organizationId=${encodeURIComponent(nextId)}`, { cache: "no-store" });
      const assignmentsPayload = await assignmentsResponse.json().catch(() => null) as { assignments?: Assignment[]; members?: Member[]; message?: string } | null;
      if (assignmentsResponse.ok && assignmentsPayload?.assignments) { setAssignments(assignmentsPayload.assignments); setMembers(assignmentsPayload.members ?? []); }
      else setMessage(assignmentsPayload?.message ?? (ar ? "تعذر تحميل التكليفات." : "Assignments could not be loaded."));
    } else { setAssignments([]); setMembers([]); }
    setLoading(false);
  }

  const loadInEffect = useEffectEvent(() => { void load(); });

  useEffect(() => {
    const timeout = window.setTimeout(loadInEffect, 0);
    return () => window.clearTimeout(timeout);
  }, []);
  useEffect(() => {
    if (!organizationId) return;
    const timeout = window.setTimeout(loadInEffect, 0);
    return () => window.clearTimeout(timeout);
  }, [organizationId]);

  async function submit(command: Record<string, unknown>) {
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/programs/field", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    if (response.ok) await load(); else setMessage(payload?.message ?? (ar ? "تعذر حفظ التكليف." : "The assignment could not be saved."));
    setSubmitting(false);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); await submit({ action: "create", organizationId, title, description: description || undefined, assigneeMemberId: assigneeMemberId || undefined }); setTitle(""); setDescription(""); setAssigneeMemberId("");
  }

  const statusLabel = (status: Assignment["status"]) => ({ ACTIVE: ar ? "نشط" : "Active", IN_PROGRESS: ar ? "قيد التنفيذ" : "In progress", COMPLETED: ar ? "مكتمل" : "Completed", CANCELLED: ar ? "ملغى" : "Cancelled" })[status];
  return <section className="field-workspace" aria-busy={loading}>
    <header className="field-workspace__header"><div><span className="eyebrow eyebrow--small">FIELD / OPERATIONS</span><h1>{ar ? "لوحة العمليات الميدانية" : "Field operations board"}</h1><p>{ar ? "أنشئ التكليفات وتابع تنفيذها. تُعرض السجلات الفعلية فقط ضمن المنشأة التي فعّلت البرنامج." : "Create and track assignments. Only real records for organizations with this program enabled are shown."}</p></div><Link className="button button--secondary" href="/programs">{ar ? "برامج المنشأة" : "Organization programs"}</Link></header>
    {organizations.length ? <label className="field-organization">{ar ? "المنشأة" : "Organization"}<select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label> : <p className="programs-message">{ar ? "فعّل برنامج العمليات الميدانية أولًا." : "Activate the field operations program first."}</p>}
    {organizations.length ? <form className="field-form" onSubmit={create}><input required minLength={2} maxLength={200} placeholder={ar ? "عنوان التكليف" : "Assignment title"} value={title} onChange={(event) => setTitle(event.target.value)} /><input maxLength={4000} placeholder={ar ? "وصف اختياري" : "Optional description"} value={description} onChange={(event) => setDescription(event.target.value)} /><select aria-label={ar ? "المكلّف" : "Assignee"} value={assigneeMemberId} onChange={(event) => setAssigneeMemberId(event.target.value)}><option value="">{ar ? "بدون مكلّف" : "Unassigned"}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.user.profile?.displayName ?? member.user.email}</option>)}</select><button className="button button--primary" disabled={submitting} type="submit">{ar ? "إضافة تكليف" : "Add assignment"}</button></form> : null}
    {message ? <p className="programs-message" role="status">{message}</p> : null}
    <div className="field-assignments">{assignments.map((assignment) => <article key={assignment.id}><div><strong>{assignment.title}</strong>{assignment.description ? <span>{assignment.description}</span> : null}{assignment.assigneeMember ? <small>{ar ? `المكلّف: ${assignment.assigneeMember.user.profile?.displayName ?? assignment.assigneeMember.user.email}` : `Assigned to: ${assignment.assigneeMember.user.profile?.displayName ?? assignment.assigneeMember.user.email}`}</small> : null}</div><div><strong>{statusLabel(assignment.status)}</strong>{assignment.status === "ACTIVE" ? <button className="button button--secondary" disabled={submitting} onClick={() => void submit({ action: "updateStatus", organizationId, assignmentId: assignment.id, status: "IN_PROGRESS" })} type="button">{ar ? "بدء" : "Start"}</button> : null}{assignment.status === "IN_PROGRESS" ? <button className="button button--primary" disabled={submitting} onClick={() => void submit({ action: "updateStatus", organizationId, assignmentId: assignment.id, status: "COMPLETED" })} type="button">{ar ? "إكمال" : "Complete"}</button> : null}</div></article>)}{!loading && organizations.length && !assignments.length ? <p className="programs-message">{ar ? "لا توجد تكليفات ميدانية بعد." : "No field assignments yet."}</p> : null}</div>
  </section>;
}