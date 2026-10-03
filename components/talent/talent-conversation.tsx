"use client";

import { FormEvent } from "react";

import type { TalentMessageRecord } from "@/components/talent/talent-flow-types";
import { Icon } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type CommandRunner = (command: Record<string, unknown> & { action: string }, success: [string, string]) => Promise<boolean>;

export function TalentConversation({ applicationId, busy, closed, currentUserId, locale, messages, runCommand }: { applicationId: string; busy: boolean; closed: boolean; currentUserId: string; locale: Locale; messages: TalentMessageRecord[]; runCommand: CommandRunner }) {
  const ar = locale === "ar";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = String(data.get("body") ?? "").trim();
    if (!body) return;
    if (await runCommand({ action: "sendMessage", applicationId, body }, ["تم إرسال الرسالة داخل مسار التوظيف.", "Message sent inside the hiring workflow."])) form.reset();
  }
  return <section className="talent-conversation" aria-label={ar ? "محادثة التوظيف" : "Hiring conversation"}>
    <header><div><span>CONVERSATION</span><h3>{ar ? "محادثة الطلب" : "Application conversation"}</h3></div><small>{ar ? "مرئية لطرفي الطلب فقط" : "Visible only to application participants"}</small></header>
    <div className="talent-conversation__messages">{messages.length ? messages.map((message) => <article className={message.senderId === currentUserId ? "is-mine" : ""} key={message.id}><header><strong>{message.senderId === currentUserId ? (ar ? "أنت" : "You") : message.sender.profile?.displayName ?? (ar ? "الطرف الآخر" : "Other participant")}</strong><time dateTime={message.createdAt}>{new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.createdAt))}</time></header><p>{message.body}</p></article>) : <div className="talent-conversation__empty"><Icon name="mail" /><p>{ar ? "لا توجد رسائل بعد." : "No messages yet."}</p></div>}</div>
    {closed ? <p className="talent-conversation__closed"><Icon name="lock" />{ar ? "أُغلقت المحادثة لأن الطلب لم يعد نشطًا." : "Conversation closed because the application is no longer active."}</p> : <form onSubmit={submit}><textarea aria-label={ar ? "نص الرسالة" : "Message body"} maxLength={2000} minLength={1} name="body" required placeholder={ar ? "اكتب رسالة مرتبطة بمسار التوظيف" : "Write a message about this hiring process"} /><button className="button button--primary" disabled={busy} type="submit"><Icon name="mail" />{ar ? "إرسال" : "Send message"}</button></form>}
  </section>;
}