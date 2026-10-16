"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HubProjectInvitations } from "@/components/projects/project-invitations";
import { Icon, type IconName } from "@/components/ui/icons";

type Notice = {
  body: string | null;
  createdAt: string;
  id: string;
  status: "ARCHIVED" | "READ" | "UNREAD";
  title: string;
  type: string;
};

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; notices: Notice[]; unread: number };

function iconFor(type: string): IconName {
  if (type.startsWith("TALENT_") || type.startsWith("JOB_")) return "briefcase";
  if (type.startsWith("MARKET")) return "cart";
  if (type.startsWith("MARKETING")) return "megaphone";
  if (type.startsWith("PROJECT")) return "rocket";
  if (type.startsWith("ACADEMY")) return "graduation";
  return "bell";
}

/** The account's own notices and pending project invitations. Nothing is shown that is not stored for this account. */
export function NotificationsPage({ locale }: { locale: "ar" | "en" }) {
  const ar = locale === "ar";
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/notifications", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return (await response.json()) as { notifications: Notice[]; unreadCount: number };
      })
      .then((payload) => setState({ kind: "ready", notices: payload.notifications, unread: payload.unreadCount }))
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setState({ kind: "error" });
      });
    return () => controller.abort();
  }, [version]);

  async function markRead(id: string) {
    setBusy(id);
    await fetch("/api/notifications", { body: JSON.stringify({ notificationId: id }), headers: { "content-type": "application/json" }, method: "POST" }).catch(() => null);
    setVersion((current) => current + 1);
    setBusy(null);
  }
  const format = new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="notices__body">
      <header className="notices__head">
        <span className="showcase__mark"><Icon name="bell" /></span>
        <div>
          <h1>{ar ? "الإشعارات" : "Notifications"}</h1>
          <p>
            {state.kind === "ready"
              ? state.unread
                ? ar ? `لديك ${state.unread} إشعار غير مقروء.` : `You have ${state.unread} unread notification${state.unread === 1 ? "" : "s"}.`
                : ar ? "لا توجد إشعارات غير مقروءة." : "No unread notifications."
              : ar ? "تنبيهات حسابك ودعوات المشاريع في مكان واحد." : "Your account's notices and project invitations in one place."}
          </p>
        </div>
      </header>

      <section aria-label={ar ? "دعوات المشاريع" : "Project invitations"} className="notices__invites">
        <HubProjectInvitations ar={ar} />
      </section>

      <section className="notices__list" aria-label={ar ? "كل الإشعارات" : "All notifications"}>
        {state.kind === "loading" ? <p className="notices__note" role="status">{ar ? "جارٍ التحميل..." : "Loading..."}</p> : null}
        {state.kind === "error" ? <p className="notices__note"><Icon name="lock" />{ar ? "تعذر تحميل الإشعارات الآن." : "Notifications could not be loaded right now."}</p> : null}
        {state.kind === "ready" && !state.notices.length ? <p className="notices__note"><Icon name="bell" />{ar ? "لا توجد إشعارات بعد. ستظهر هنا تحديثات طلباتك وحملاتك ومشاريعك." : "No notifications yet. Updates on your applications, campaigns and projects will appear here."}</p> : null}
        {state.kind === "ready" ? (
          <ul>
            {state.notices.map((notice) => (
              <li className={notice.status === "UNREAD" ? "is-unread" : undefined} key={notice.id}>
                <span aria-hidden="true" className="showcase__mark"><Icon name={iconFor(notice.type)} /></span>
                <span className="notices__text">
                  <strong>{notice.title}</strong>
                  {notice.body ? <small>{notice.body}</small> : null}
                  <time dateTime={notice.createdAt}>{format.format(new Date(notice.createdAt))}</time>
                </span>
                {notice.status === "UNREAD" ? (
                  <button disabled={busy === notice.id} onClick={() => void markRead(notice.id)} type="button">{ar ? "تعيين كمقروء" : "Mark as read"}</button>
                ) : (
                  <em>{ar ? "مقروء" : "Read"}</em>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <p className="notices__links">
        <Link href="/talent/notifications">{ar ? "إشعارات التوظيف" : "Hiring notifications"}</Link>
        <Link href="/projects">{ar ? "مشاريعي" : "My projects"}</Link>
      </p>
    </div>
  );
}
