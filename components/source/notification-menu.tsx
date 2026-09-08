"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Icon } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Notification = { id: string; title: string; body: string | null; status: "UNREAD" | "READ"; createdAt: string };

export function NotificationMenu({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function load() {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { notifications?: Notification[]; unreadCount?: number } | null;
    if (response.ok && payload?.notifications) { setNotifications(payload.notifications); setUnreadCount(payload.unreadCount ?? 0); }
  }

  const loadOnMount = useEffectEvent(() => { void load(); });

  useEffect(() => {
    const timeout = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function markRead(notificationId: string) {
    const response = await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notificationId }) });
    if (response.ok) {
      setNotifications((current) => current.map((notification) => notification.id === notificationId ? { ...notification, status: "READ" } : notification));
      setUnreadCount((current) => Math.max(0, current - 1));
    }
  }

  return <details className="notification-menu" onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) void load(); }}><summary aria-label={ar ? "الإشعارات" : "Notifications"}><Icon name="bell" />{unreadCount ? <b>{unreadCount > 9 ? "9+" : unreadCount}</b> : null}</summary><div className="notification-menu__panel">{notifications.map((notification) => <button className={notification.status === "UNREAD" ? "is-unread" : ""} key={notification.id} onClick={() => { if (notification.status === "UNREAD") void markRead(notification.id); }} type="button"><strong>{notification.title}</strong>{notification.body ? <span>{notification.body}</span> : null}</button>)}{!notifications.length ? <p>{ar ? "لا توجد إشعارات." : "No notifications."}</p> : null}</div></details>;
}