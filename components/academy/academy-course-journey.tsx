"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";

import type { Locale } from "@/types/i18n";

export type AcademyCourseJourneyRecord = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  lessons: Array<{ id: string; sequence: number; title: string; content: string | null }>;
  labs: Array<{ id: string; sequence: number; title: string; instructions: string | null }>;
  exams: Array<{ id: string; title: string; passingScore: number; assessmentType: string }>;
  skills?: Array<{ skill: { name: string; description: string | null } }>;
};

type CourseMode = "certificate" | "detail" | "lesson" | "quiz" | "result";
type Progress = {
  certificate: { id: string; status: string; awardedAt: string; expiresAt: string | null; certification: { name: string } | null } | null;
  completedLessonIds: string[];
  enrollment: { status: "ENROLLED" | "COMPLETED" } | null;
  examAttempts: Array<{ id: string; examId: string; score: number; outcome: "PENDING" | "PASSED" | "FAILED"; createdAt: string }>;
  examQuestions: Array<{ id: string; questions: Array<{ id: string; prompt: string; sequence: number; points: number; options: Array<{ id: string; label: string; sequence: number }> }> }>;
  lessonNotes: Array<{ id: string; lessonId: string; content: string; updatedAt: string }>;
};

export function AcademyCourseJourney({ course, locale, mode }: { course: AcademyCourseJourneyRecord; locale: Locale; mode: CourseMode }) {
  const ar = locale === "ar";
  const [progress, setProgress] = useState<Progress | null>(null);
  const [currentLessonId, setCurrentLessonId] = useState(course.lessons[0]?.id ?? "");
  const [selectedExamId, setSelectedExamId] = useState(course.exams[0]?.id ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/academy/progress?courseId=${encodeURIComponent(course.id)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null) as (Progress & { message?: string }) | null;
    if (response.ok && payload) {
      setProgress(payload);
      setDraftNotes(Object.fromEntries(payload.lessonNotes.map((note) => [note.lessonId, note.content])));
      const firstIncomplete = course.lessons.find((lesson) => !payload.completedLessonIds.includes(lesson.id));
      setCurrentLessonId((current) => current || firstIncomplete?.id || course.lessons[0]?.id || "");
    } else setMessage(payload?.message ?? (ar ? "تعذر تحميل تقدم التعلم." : "Learning progress could not be loaded."));
  }

  const loadOnMount = useEffectEvent(() => { void load(); });
  useEffect(() => { const timeout = window.setTimeout(loadOnMount, 0); return () => window.clearTimeout(timeout); }, [course.id]);

  const currentLesson = course.lessons.find((lesson) => lesson.id === currentLessonId) ?? course.lessons[0] ?? null;
  const currentLessonIndex = currentLesson ? course.lessons.findIndex((lesson) => lesson.id === currentLesson.id) : -1;
  const currentNote = currentLesson ? draftNotes[currentLesson.id] ?? "" : "";
  const courseRoute = `/academy/courses/${course.id}`;

  async function command(body: Record<string, unknown>, success: string) {
    setBusy(true); setMessage("");
    const response = await fetch("/api/academy/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    if (response.ok) { await load(); setMessage(success); }
    else setMessage(payload?.message ?? (ar ? "تعذر حفظ التقدم." : "Progress could not be saved."));
    setBusy(false);
    return response.ok;
  }

  const attemptsByExam = new Map<string, Progress["examAttempts"][number]>();
  for (const attempt of progress?.examAttempts ?? []) if (!attemptsByExam.has(attempt.examId)) attemptsByExam.set(attempt.examId, attempt);
  const exam = course.exams.find((item) => item.id === selectedExamId) ?? course.exams[0] ?? null;
  const questions = progress?.examQuestions.find((item) => item.id === exam?.id)?.questions ?? [];
  const completion = course.lessons.length ? Math.round(((progress?.completedLessonIds.length ?? 0) / course.lessons.length) * 100) : 0;
  const outputs = mode === "certificate" && progress?.certificate ? "PRINT_PDF,SHARE_LINK" : "NONE";

  async function submitExam() {
    if (!exam || questions.some((question) => !answers[question.id])) return;
    await command({ action: "submitExam", examId: exam.id, answers: questions.map((question) => ({ questionId: question.id, optionId: answers[question.id] })) }, ar ? "تم تصحيح التقييم وحفظ نتيجته." : "Assessment graded and saved.");
    setAnswers({});
  }

  async function shareCertificate() {
    if (!progress?.certificate) return;
    const verificationUrl = `${window.location.origin}/academy/verify/${progress.certificate.id}`;
    const data = { title: progress.certificate.certification?.name ?? course.title, text: course.title, url: verificationUrl };
    if (navigator.share) await navigator.share(data).catch(() => undefined);
    else { await navigator.clipboard.writeText(verificationUrl); setMessage(ar ? "تم نسخ رابط التحقق من الشهادة." : "Certificate verification link copied."); }
  }

  return <section className="academy-course-journey" aria-busy={!progress || busy} data-academy-course-mode={mode} data-academy-course-source="ACADEMY_REGISTRY" data-academy-outputs={outputs}>
    <div className="academy-course-journey__summary"><article><span>{ar ? "التقدم" : "Progress"}</span><strong>{completion}%</strong></article><article><span>{ar ? "الدروس" : "Lessons"}</span><strong>{progress?.completedLessonIds.length ?? 0}/{course.lessons.length}</strong></article><article><span>{ar ? "التقييمات" : "Assessments"}</span><strong>{[...attemptsByExam.values()].filter((item) => item.outcome === "PASSED").length}/{course.exams.length}</strong></article><article><span>{ar ? "الشهادة" : "Certificate"}</span><strong>{progress?.certificate ? (ar ? "معتمدة" : "Certified") : (ar ? "قيد الإنجاز" : "In progress")}</strong></article></div>
    {!progress?.enrollment ? <section className="academy-course-journey__gate"><strong>{ar ? "ابدأ مساراً موثقاً" : "Start an auditable learning path"}</strong><p>{ar ? "يسجل الالتحاق والتقدم والتقييمات والشهادة في حسابك." : "Enrollment, progress, assessments, and certification are recorded to your account."}</p><button className="button button--primary" disabled={busy} onClick={() => void command({ action: "enroll", courseId: course.id }, ar ? "تم الالتحاق بالدورة." : "Course enrollment recorded.")} type="button">{ar ? "الالتحاق بالدورة" : "Enroll in course"}</button></section> : null}

    {mode === "detail" ? <div className="academy-course-journey__detail"><section><h3>{ar ? "خطة التعلم" : "Learning plan"}</h3>{course.lessons.map((lesson) => <article key={lesson.id}><span>{String(lesson.sequence).padStart(2, "0")}</span><div><strong>{lesson.title}</strong><small>{progress?.completedLessonIds.includes(lesson.id) ? (ar ? "مكتمل" : "Completed") : (ar ? "بانتظار التعلم" : "Pending")}</small></div></article>)}</section><section><h3>{ar ? "المختبرات والتقييم" : "Labs and assessment"}</h3>{course.labs.map((lab) => <article key={lab.id}><span>{String(lab.sequence).padStart(2, "0")}</span><div><strong>{lab.title}</strong><small>{lab.instructions ?? (ar ? "لا توجد تعليمات منشورة." : "No published instructions.")}</small></div></article>)}{course.exams.map((item) => <article key={item.id}><span>{item.passingScore}%</span><div><strong>{item.title}</strong><small>{item.assessmentType}</small></div></article>)}</section>{progress?.enrollment && course.lessons.length ? <Link className="button button--primary" href={`${courseRoute}/lesson/1`}>{completion ? (ar ? "متابعة التعلم" : "Continue learning") : (ar ? "ابدأ الدرس الأول" : "Start first lesson")}</Link> : null}</div> : null}

    {mode === "lesson" ? currentLesson ? <div className="academy-lesson-player"><nav aria-label={ar ? "قائمة الدروس" : "Lesson list"}>{course.lessons.map((lesson) => <button className={lesson.id === currentLesson.id ? "is-active" : ""} key={lesson.id} onClick={() => setCurrentLessonId(lesson.id)} type="button"><span>{String(lesson.sequence).padStart(2, "0")}</span><strong>{lesson.title}</strong><small>{progress?.completedLessonIds.includes(lesson.id) ? (ar ? "مكتمل" : "Completed") : (ar ? "غير مكتمل" : "Pending")}</small></button>)}</nav><article><header><span>{ar ? `الدرس ${currentLesson.sequence}` : `Lesson ${currentLesson.sequence}`}</span><h3>{currentLesson.title}</h3></header><div className="academy-lesson-player__content">{currentLesson.content ?? (ar ? "لا يوجد محتوى منشور لهذا الدرس." : "No published content is available for this lesson.")}</div><label>{ar ? "ملاحظاتي الخاصة" : "My private notes"}<textarea maxLength={10_000} value={currentNote} onChange={(event) => setDraftNotes({ ...draftNotes, [currentLesson.id]: event.target.value })} placeholder={ar ? "دوّن استنتاجاتك هنا..." : "Capture your learning notes..."} /></label><div className="academy-lesson-player__actions"><button className="button button--secondary" disabled={busy || !currentNote.trim()} onClick={() => void command({ action: "saveNote", content: currentNote, lessonId: currentLesson.id }, ar ? "تم حفظ الملاحظة." : "Note saved.")} type="button">{ar ? "حفظ الملاحظة" : "Save note"}</button><button className="button button--primary" disabled={busy || !progress?.enrollment || progress.completedLessonIds.includes(currentLesson.id)} onClick={() => void command({ action: "completeLesson", lessonId: currentLesson.id }, ar ? "تم إكمال الدرس." : "Lesson completed.")} type="button">{ar ? "إتمام الدرس" : "Complete lesson"}</button>{currentLessonIndex < course.lessons.length - 1 ? <button className="button button--ghost" onClick={() => setCurrentLessonId(course.lessons[currentLessonIndex + 1]!.id)} type="button">{ar ? "الدرس التالي" : "Next lesson"}</button> : <Link className="button button--ghost" href={`${courseRoute}/quiz`}>{ar ? "الانتقال إلى التقييم" : "Continue to assessment"}</Link>}</div></article></div> : <p className="academy-course-journey__state">{ar ? "لا توجد دروس منشورة." : "No lessons are published."}</p> : null}

    {mode === "quiz" ? <div className="academy-quiz"><nav aria-label={ar ? "التقييمات" : "Assessments"}>{course.exams.map((item) => <button className={item.id === exam?.id ? "is-active" : ""} key={item.id} onClick={() => { setSelectedExamId(item.id); setAnswers({}); }} type="button"><strong>{item.title}</strong><small>{ar ? `درجة الاجتياز ${item.passingScore}%` : `Passing score ${item.passingScore}%`}</small></button>)}</nav>{exam ? <section><header><h3>{exam.title}</h3>{attemptsByExam.get(exam.id) ? <span>{attemptsByExam.get(exam.id)!.outcome} · {attemptsByExam.get(exam.id)!.score}%</span> : null}</header>{questions.length ? <><ol>{questions.map((question) => <li key={question.id}><strong>{question.prompt}</strong><div>{question.options.map((option) => <label key={option.id}><input checked={answers[question.id] === option.id} name={`question-${question.id}`} onChange={() => setAnswers({ ...answers, [question.id]: option.id })} type="radio" /><span>{option.label}</span></label>)}</div></li>)}</ol><button className="button button--primary" disabled={busy || !progress?.enrollment || questions.some((question) => !answers[question.id])} onClick={() => void submitExam()} type="button">{ar ? "إرسال وتصحيح التقييم" : "Submit and grade assessment"}</button></> : <div className="academy-course-journey__state"><strong>{ar ? "بانتظار أسئلة معتمدة" : "Awaiting approved questions"}</strong><p>{ar ? "لن تقبل المنصة درجة يكتبها المتعلم أو تقييماً بلا مفتاح إجابة موثق." : "The platform will not accept a learner-entered score or an assessment without a verified answer key."}</p></div>}</section> : <p className="academy-course-journey__state">{ar ? "لا توجد تقييمات منشورة." : "No assessments are published."}</p>}</div> : null}

    {mode === "result" ? <div className="academy-course-result"><header><div><span>{ar ? "نسبة الإنجاز" : "Completion"}</span><strong>{completion}%</strong></div><div><span>{ar ? "أفضل نتيجة" : "Best score"}</span><strong>{progress?.examAttempts.length ? `${Math.max(...progress.examAttempts.map((item) => item.score))}%` : "—"}</strong></div></header><section><h3>{ar ? "المهارات المرتبطة" : "Linked skills"}</h3>{course.skills?.length ? course.skills.map(({ skill }) => <article key={skill.name}><strong>{skill.name}</strong><p>{skill.description ?? (ar ? "مهارة موثقة في منهج الدورة." : "A skill documented in the course curriculum.")}</p></article>) : <p>{ar ? "لا توجد مهارات مرتبطة منشورة." : "No linked skills are published."}</p>}</section>{progress?.certificate ? <Link className="button button--primary" href={`${courseRoute}/certificate`}>{ar ? "فتح الشهادة" : "Open certificate"}</Link> : <p className="academy-course-journey__state">{ar ? "تُصدر الشهادة بعد إكمال الدروس واجتياز التقييمات." : "The certificate is issued after lessons and assessments are completed."}</p>}</div> : null}

    {mode === "certificate" ? progress?.certificate ? <article className="academy-certificate"><header><span>JENAN PRO ACADEMY</span><strong>{progress.certificate.certification?.name ?? (ar ? "شهادة إتمام معتمدة" : "Certified course completion")}</strong><p>{course.title}</p></header><dl><div><dt>{ar ? "رمز التحقق" : "Verification ID"}</dt><dd>{progress.certificate.id}</dd></div><div><dt>{ar ? "تاريخ الإصدار" : "Awarded"}</dt><dd>{new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "long" }).format(new Date(progress.certificate.awardedAt))}</dd></div><div><dt>{ar ? "الحالة" : "Status"}</dt><dd>{progress.certificate.status}</dd></div></dl><div className="academy-certificate__actions"><button className="button button--primary" onClick={() => window.print()} type="button">{ar ? "طباعة / PDF" : "Print / PDF"}</button><button className="button button--secondary" onClick={() => void shareCertificate()} type="button">{ar ? "مشاركة" : "Share"}</button><Link className="button button--ghost" href={`/academy/verify/${progress.certificate.id}`} target="_blank">{ar ? "التحقق العام" : "Public verification"}</Link></div></article> : <div className="academy-course-journey__state"><strong>{ar ? "لا توجد شهادة صادرة" : "No certificate issued"}</strong><p>{ar ? "تظهر الشهادة هنا بعد استيفاء متطلبات الدورة الفعلية." : "A certificate appears here after the actual course requirements are met."}</p></div> : null}
    {message ? <p className="academy-course-journey__message" role="status">{message}</p> : null}
  </section>;
}