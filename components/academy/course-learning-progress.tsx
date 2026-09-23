"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Lesson = { id: string; title: string };
type Exam = { id: string; title: string; passingScore: number; assessmentType: string };
type Enrollment = { status: "ENROLLED" | "COMPLETED" } | null;
type ExamAttempt = {
  id: string;
  examId: string;
  score: number;
  outcome: "PENDING" | "PASSED" | "FAILED";
  createdAt: string;
};
type Certificate = {
  id: string;
  status: string;
  awardedAt: string;
  expiresAt: string | null;
  certification: { name: string } | null;
} | null;

export function CourseLearningProgress({
  courseId,
  exams,
  lessons,
  locale,
}: {
  courseId: string;
  exams: Exam[];
  lessons: Lesson[];
  locale: Locale;
}) {
  const ar = locale === "ar";
  const [enrollment, setEnrollment] = useState<Enrollment>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([]);
  const [examAttempts, setExamAttempts] = useState<ExamAttempt[]>([]);
  const [certificate, setCertificate] = useState<Certificate>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/academy/progress?courseId=${encodeURIComponent(courseId)}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as {
      certificate?: Certificate;
      completedLessonIds?: string[];
      enrollment?: Enrollment;
      examAttempts?: ExamAttempt[];
    } | null;
    if (!response.ok || !payload) return;
    setEnrollment(payload.enrollment ?? null);
    setCompletedLessonIds(payload.completedLessonIds ?? []);
    setExamAttempts(payload.examAttempts ?? []);
    setCertificate(payload.certificate ?? null);
  }

  const loadOnMount = useEffectEvent(() => {
    void load();
  });

  useEffect(() => {
    const timeout = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timeout);
  }, [courseId]);

  async function command(body: Record<string, number | string>) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/academy/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.ok) {
      await load();
      setMessage(ar ? "تم حفظ تقدمك." : "Progress saved.");
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر حفظ تقدمك." : "Progress could not be saved."));
    }
    setBusy(false);
  }

  const attemptsByExam = new Map<string, ExamAttempt>();
  for (const attempt of examAttempts) if (!attemptsByExam.has(attempt.examId)) attemptsByExam.set(attempt.examId, attempt);
  const completed = completedLessonIds.length;
  const passedExams = exams.filter((exam) => attemptsByExam.get(exam.id)?.outcome === "PASSED").length;

  return (
    <section className="academy-learning-progress" aria-live="polite">
      <div className="academy-learning-progress__summary">
        <div>
          <strong>{ar ? "تقدمك في الدورة" : "Your course progress"}</strong>
          <span>
            {enrollment?.status === "COMPLETED"
              ? ar ? "الدروس مكتملة" : "Lessons completed"
              : enrollment ? `${completed}/${lessons.length}` : ar ? "غير مسجل" : "Not enrolled"}
          </span>
        </div>
        <div>
          <strong>{ar ? "التقييمات" : "Assessments"}</strong>
          <span>{passedExams}/{exams.length}</span>
        </div>
        <div>
          <strong>{ar ? "الشهادة" : "Certificate"}</strong>
          <span>{certificate ? (ar ? "معتمدة" : "Certified") : (ar ? "بانتظار الإكمال" : "Pending completion")}</span>
        </div>
      </div>

      {!enrollment ? (
        <button className="button button--primary" disabled={busy} onClick={() => void command({ action: "enroll", courseId })} type="button">
          {ar ? "التسجيل في الدورة" : "Enroll in course"}
        </button>
      ) : (
        <>
          <div className="academy-learning-progress__lessons">
            {lessons.map((lesson) => {
              const done = completedLessonIds.includes(lesson.id);
              return (
                <button className={done ? "is-complete" : ""} disabled={busy || done} key={lesson.id} onClick={() => void command({ action: "completeLesson", lessonId: lesson.id })} type="button">
                  {done ? (ar ? "مكتمل" : "Completed") : (ar ? `إتمام: ${lesson.title}` : `Complete: ${lesson.title}`)}
                </button>
              );
            })}
          </div>

          <div className="academy-learning-progress__exams">
            {exams.map((exam) => {
              const attempt = attemptsByExam.get(exam.id);
              return (
                <article key={exam.id}>
                  <div>
                    <strong>{exam.title}</strong>
                    <span>{exam.assessmentType} - {ar ? "درجة الاجتياز" : "Passing score"}: {exam.passingScore}%</span>
                    {attempt ? <small>{attempt.outcome === "PASSED" ? (ar ? "ناجح" : "Passed") : (ar ? "لم يجتز" : "Not passed")} - {attempt.score}%</small> : null}
                  </div>
                  <label>
                    <span>{ar ? "درجتك" : "Score"}</span>
                    <input
                      disabled={busy}
                      max={100}
                      min={0}
                      onChange={(event) => setScores({ ...scores, [exam.id]: event.target.value })}
                      placeholder={String(exam.passingScore)}
                      type="number"
                      value={scores[exam.id] ?? ""}
                    />
                  </label>
                  <button
                    className="button button--secondary"
                    disabled={busy || scores[exam.id] === undefined || scores[exam.id] === ""}
                    onClick={() => void command({ action: "submitExam", examId: exam.id, score: Number(scores[exam.id]) })}
                    type="button"
                  >
                    {ar ? "تسجيل التقييم" : "Submit assessment"}
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}

      {certificate ? (
        <div className="academy-learning-progress__certificate">
          <strong>{certificate.certification?.name ?? (ar ? "شهادة إكمال معتمدة" : "Certified course completion")}</strong>
          <span>{ar ? "تاريخ الاعتماد" : "Awarded"}: {new Date(certificate.awardedAt).toLocaleDateString(locale)}</span>
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}