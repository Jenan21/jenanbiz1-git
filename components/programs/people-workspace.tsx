"use client";

import Link from "next/link";
import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Organization = { id: string; name: string; businessPrograms: Array<{ key: string; status: string }> };
type Member = { id: string; status: "INVITED" | "ACTIVE" | "SUSPENDED"; isOwner: boolean; joinedAt: string | null; user: { email: string; profile: { displayName: string | null } | null } };
type Invitation = { id: string; organization: { id: string; name: string } };

export function PeopleWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function request(path: string, options?: RequestInit) {
    const response = await fetch(path, options);
    const payload = await response.json().catch(() => null) as { message?: string; members?: Member[]; invitations?: Invitation[]; organizations?: Array<{ organization: Organization }> } | null;
    if (!response.ok) throw new Error(payload?.message ?? "Request failed");
    return payload;
  }

  async function load() {
    setLoading(true); setMessage("");
    try {
      const [programs, pending] = await Promise.all([request("/api/programs"), request("/api/programs/people")]);
      const nextOrganizations = (programs?.organizations ?? []).map(({ organization }) => organization).filter((organization) => organization.businessPrograms.some((program) => program.key === "PEOPLE" && program.status === "ACTIVE"));
      const nextId = nextOrganizations.some((organization) => organization.id === organizationId) ? organizationId : (nextOrganizations[0]?.id ?? "");
      setOrganizations(nextOrganizations); setOrganizationId(nextId); setInvitations(pending?.invitations ?? []);
      if (nextId) {
        try { setMembers((await request(`/api/programs/people?organizationId=${encodeURIComponent(nextId)}`))?.members ?? []); }
        catch { setMembers([]); }
      } else setMembers([]);
    } catch { setMessage(ar ? "تعذر تحميل إدارة الأفراد." : "People operations could not be loaded."); }
    finally { setLoading(false); }
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

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setMessage("");
    try { await request("/api/programs/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "invite", organizationId, email }) }); setEmail(""); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : (ar ? "تعذرت الدعوة." : "Invitation failed.")); }
    finally { setSubmitting(false); }
  }

  async function acceptInvitation(membershipId: string) {
    setSubmitting(true); setMessage("");
    try { await request("/api/programs/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "acceptInvitation", membershipId }) }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : (ar ? "تعذر قبول الدعوة." : "Invitation acceptance failed.")); }
    finally { setSubmitting(false); }
  }

  return <section className="people-workspace" aria-busy={loading}>
    <header className="people-workspace__header"><div><span className="eyebrow eyebrow--small">PEOPLE / TEAM</span><h1>{ar ? "إدارة الأفراد والفرق" : "People and team operations"}</h1><p>{ar ? "يدعو المالك المستخدمين المسجلين، ولا تصبح العضوية فعالة إلا بعد قبول الدعوة من صاحبها." : "The owner invites registered users; a membership becomes active only after its recipient accepts."}</p></div><Link className="button button--secondary" href="/programs">{ar ? "برامج المنشأة" : "Organization programs"}</Link></header>
    {organizations.length ? <label className="people-organization">{ar ? "المنشأة" : "Organization"}<select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label> : null}
    {organizations.length ? <form className="people-invite" onSubmit={invite}><input required type="email" maxLength={320} placeholder={ar ? "بريد مستخدم مسجل في المنصة" : "Registered platform user email"} value={email} onChange={(event) => setEmail(event.target.value)} /><button className="button button--primary" disabled={submitting || !organizationId} type="submit">{ar ? "إرسال دعوة" : "Send invitation"}</button></form> : null}
    {message ? <p className="programs-message" role="status">{message}</p> : null}
    {invitations.length ? <section className="people-invitations"><h2>{ar ? "دعواتك المعلّقة" : "Your pending invitations"}</h2>{invitations.map((invitation) => <article key={invitation.id}><strong>{invitation.organization.name}</strong><button className="button button--primary" disabled={submitting} onClick={() => void acceptInvitation(invitation.id)} type="button">{ar ? "قبول الدعوة" : "Accept invitation"}</button></article>)}</section> : null}
    <section className="people-members"><h2>{ar ? "أعضاء الفريق" : "Team members"}</h2>{members.map((member) => <article key={member.id}><div><strong>{member.user.profile?.displayName ?? member.user.email}</strong><span>{member.user.email}</span></div><div><strong>{member.isOwner ? (ar ? "مالك" : "Owner") : member.status === "ACTIVE" ? (ar ? "نشط" : "Active") : (ar ? "بانتظار القبول" : "Pending acceptance")}</strong></div></article>)}{!loading && organizations.length && !members.length ? <p className="programs-message">{ar ? "تحتاج صلاحية مالك المنشأة لإدارة الفريق." : "Organization owner access is required to manage the team."}</p> : null}</section>
  </section>;
}