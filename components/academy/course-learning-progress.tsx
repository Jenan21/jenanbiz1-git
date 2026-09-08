"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Lesson = { id: string; title: string };
type Enrollment = { status: "ENROLLED" | "COMPLETED" } | null;

export function CourseLearningProgress({ courseId, lessons, locale }: { courseId: string; lessons: Lesson[]; locale: Locale }) {
  const ar = locale === "ar";
  const [enrollment, setEnrollment] = useState<Enrollment>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/academy/progress?courseId=${encodeURIComponent(courseId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { enrollment?: Enrollment; completedLessonIds?: string[] } | null;
    if (response.ok && payload) { setEnrollment(payload.enrollment ?? null); setCompletedLessonIds(payload.completedLessonIds ?? []); }
  }

  const loadOnMount = useEffectEvent(() => { void load(); });

  useEffect(() => {
    const timeout = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timeout);
  }, [courseId]);

  async function command(body: Record<string, string>) {
    setBusy(true); setMessage("");
    const response = await fetch("/api/academy/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    if (response.ok) await load(); else setMessage(payload?.message ?? (ar ? "تعذر حفظ تقدمك." : "Progress could not be saved."));
    setBusy(false);
  }

  const completed = completedLessonIds.length;
  return <section className="academy-learning-progress"><div><strong>{ar ? "تقدمك في الدورة" : "Your course progress"}</strong><span>{enrollment?.status === "COMPLETED" ? (ar ? "مكتملة" : "Completed") : enrollment ? `${completed}/${lessons.length}` : (ar ? "غير مسجل" : "Not enrolled")}</span></div>{!enrollment ? <button className="button button--primary" disabled={busy} onClick={() => void command({ action: "enroll", courseId })} type="button">{ar ? "التسجيل في الدورة" : "Enroll in course"}</button> : <div className="academy-learning-progress__lessons">{lessons.map((lesson) => <button className={completedLessonIds.includes(lesson.id) ? "is-complete" : ""} disabled={busy || completedLessonIds.includes(lesson.id)} key={lesson.id} onClick={() => void command({ action: "completeLesson", lessonId: lesson.id })} type="button">{completedLessonIds.includes(lesson.id) ? (ar ? "مكتمل" : "Completed") : (ar ? `إتمام: ${lesson.title}` : `Complete: ${lesson.title}`)}</button>)}</div>}{message ? <p role="status">{message}</p> : null}</section>;
}