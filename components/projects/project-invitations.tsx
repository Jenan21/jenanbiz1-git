"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export interface ReceivedInvitation {
  id: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  project: { id: string; name: string };
  invitedByName: string | null;
}

export interface SentInvitation {
  id: string;
  projectId: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

export type InvitationDelivery = "email" | "skipped" | "unavailable";

interface InvitationLists {
  received: ReceivedInvitation[];
  sent: SentInvitation[];
  requiresVerification: boolean;
}

export class ProjectCommandError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ProjectCommandError";
  }
}

export async function postProjectCommand<T>(body: Record<string, unknown>, fallback: string) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { success?: boolean; result?: T; code?: string; message?: string } | null;
  if (!response.ok || !payload?.success) throw new ProjectCommandError(payload?.message ?? fallback, payload?.code);
  return payload.result as T;
}

export function invitationDeliveryMessage(ar: boolean, delivery: InvitationDelivery) {
  if (delivery === "email") return ar ? "أُرسلت الدعوة بالبريد، وتنتظر قبول المدعو." : "Invitation e-mailed; it waits for the person to accept.";
  if (delivery === "skipped") return ar ? "الدعوة مفتوحة وقد أُرسلت بالبريد قبل قليل." : "The invitation is already open and was e-mailed a moment ago.";
  return ar
    ? "حُفظت الدعوة، لكن إرسال البريد غير مُعدّ بعد؛ ستظهر للمدعو عند دخوله بالبريد نفسه."
    : "Invitation saved. E-mail delivery is not set up yet; the person will see it after signing in with this address.";
}

function useInvitationLists(refreshKey: number) {
  const [lists, setLists] = useState<InvitationLists>({ received: [], sent: [], requiresVerification: false });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects/invitations", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Partial<InvitationLists>>) : null))
      .then((payload) => {
        if (payload) setLists({ received: payload.received ?? [], sent: payload.sent ?? [], requiresVerification: Boolean(payload.requiresVerification) });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [refreshKey, version]);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  return { ...lists, refresh };
}

const formatDate = (value: string, ar: boolean) => new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "medium" }).format(new Date(value));

/** Invitations waiting for the signed-in person, with accept and decline. */
export function ReceivedProjectInvitations({ ar, onAccepted, refreshKey = 0 }: { ar: boolean; onAccepted: () => void | Promise<void>; refreshKey?: number }) {
  const { received, requiresVerification, refresh } = useInvitationLists(refreshKey);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  async function respond(invitation: ReceivedInvitation, action: "acceptInvitation" | "declineInvitation") {
    setBusyId(invitation.id);
    setMessage("");
    try {
      await postProjectCommand({ action, invitationId: invitation.id }, ar ? "تعذر تنفيذ العملية." : "The operation could not be completed.");
      refresh();
      if (action === "acceptInvitation") {
        await onAccepted();
        setMessage(ar ? `انضممت إلى «${invitation.project.name}».` : `You joined "${invitation.project.name}".`);
      } else {
        setMessage(ar ? "تم رفض الدعوة." : "Invitation declined.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ar ? "تعذر تنفيذ العملية." : "The operation could not be completed.");
      refresh();
    } finally {
      setBusyId("");
    }
  }

  if (!received.length && !requiresVerification && !message) return null;
  return (
    <section className="project-invitations" aria-label={ar ? "دعوات المشاريع" : "Project invitations"} data-testid="received-project-invitations">
      <h3>{ar ? "دعواتك إلى المشاريع" : "Your project invitations"}</h3>
      {requiresVerification ? (
        <p role="status">
          {ar ? "وثّق بريدك الإلكتروني لتظهر لك الدعوات الموجّهة إليه. " : "Verify your e-mail address to see invitations sent to it. "}
          <Link href="/user/verify-email?next=%2Fprojects">{ar ? "توثيق البريد" : "Verify e-mail"}</Link>
        </p>
      ) : null}
      <ul>
        {received.map((invitation) => (
          <li key={invitation.id}>
            <div>
              <strong>{invitation.project.name}</strong>
              <small>
                {ar ? "الدور" : "Role"}: {invitation.role}
                {invitation.invitedByName ? ` · ${ar ? "من" : "from"} ${invitation.invitedByName}` : ""}
                {` · ${ar ? "تنتهي" : "expires"} ${formatDate(invitation.expiresAt, ar)}`}
              </small>
            </div>
            <div className="project-invitations__actions">
              <button className="button button--secondary" type="button" disabled={busyId === invitation.id} onClick={() => void respond(invitation, "acceptInvitation")}>
                {ar ? "قبول" : "Accept"}
              </button>
              <button className="button button--ghost" type="button" disabled={busyId === invitation.id} onClick={() => void respond(invitation, "declineInvitation")}>
                {ar ? "رفض" : "Decline"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

/** The same list for the server-rendered Projects hub: after accepting, the page's own data is refreshed. */
export function HubProjectInvitations({ ar }: { ar: boolean }) {
  const router = useRouter();
  return (
    <div className="projects-dashboard__invitations">
      <ReceivedProjectInvitations ar={ar} onAccepted={() => router.refresh()} />
    </div>
  );
}

/** Invitations the owner has sent for one project that nobody has answered yet, each with a cancel button. */
export function SentProjectInvitations({ ar, projectId, refreshKey }: { ar: boolean; projectId: string; refreshKey: number }) {
  const { sent, refresh } = useInvitationLists(refreshKey);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const pending = sent.filter((invitation) => invitation.projectId === projectId);

  async function cancel(invitation: SentInvitation) {
    setBusyId(invitation.id);
    setMessage("");
    try {
      await postProjectCommand({ action: "revokeInvitation", projectId, invitationId: invitation.id }, ar ? "تعذر إلغاء الدعوة." : "The invitation could not be cancelled.");
      setMessage(ar ? "أُلغيت الدعوة." : "Invitation cancelled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ar ? "تعذر إلغاء الدعوة." : "The invitation could not be cancelled.");
    } finally {
      refresh();
      setBusyId("");
    }
  }

  if (!pending.length && !message) return null;
  return (
    <section className="project-invitations" aria-label={ar ? "دعوات بانتظار الرد" : "Pending invitations"} data-testid="sent-project-invitations">
      <h3>{ar ? "دعوات بانتظار الرد" : "Pending invitations"}</h3>
      <ul>
        {pending.map((invitation) => (
          <li key={invitation.id}>
            <div>
              <strong>{invitation.email}</strong>
              <small>
                {invitation.role} · {ar ? "تنتهي" : "expires"} {formatDate(invitation.expiresAt, ar)}
              </small>
            </div>
            <div className="project-invitations__actions">
              <button className="button button--ghost" type="button" disabled={busyId === invitation.id} onClick={() => void cancel(invitation)}>
                {ar ? "إلغاء الدعوة" : "Cancel invitation"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
