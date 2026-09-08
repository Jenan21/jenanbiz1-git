import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getRequestDictionary } from "@/lib/i18n/server";
import { PlatformShell } from "@/components/custom/platform-shell";
import { CourseLearningProgress } from "@/components/academy/course-learning-progress";
import type { Locale } from "@/types/i18n";

export default async function AcademyCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const [{ courseId }, { locale }, user] = await Promise.all([
    params,
    getRequestDictionary(),
    requireUser("/academy"),
  ]);
  const course = await db.academyCourse.findUnique({
    where: { id: courseId },
    include: {
      field: true,
      specialization: true,
      lessons: { orderBy: { sequence: "asc" } },
      labs: { orderBy: { sequence: "asc" } },
      exams: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!course) notFound();

  const ar = locale === "ar";
  return (
    <PlatformShell locale={locale as Locale} activeRoute="/academy" userLabel={user.profile?.displayName ?? user.email}>
      <article className="academy-course-page">
        <Link className="academy-course-page__back" href="/academy">{ar ? "العودة إلى الأكاديمية" : "Back to academy"}</Link>
        <header>
          <span className="eyebrow eyebrow--small">{course.code}</span>
          <h1>{course.title}</h1>
          <p>{course.description ?? (ar ? "مادة أكاديمية منظمة." : "A structured academy course.")}</p>
          <span className="academy-course-page__field">{course.field?.name ?? course.specialization?.name ?? (ar ? "مسار عام" : "General track")}</span>
        </header>
        <CourseLearningProgress courseId={course.id} lessons={course.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title }))} locale={locale as Locale} />
        <section aria-labelledby="lessons-title">
          <h2 id="lessons-title">{ar ? "الدروس" : "Lessons"}</h2>
          {course.lessons.map((lesson) => <article className="academy-course-page__item" key={lesson.id}><span>{String(lesson.sequence).padStart(2, "0")}</span><div><h3>{lesson.title}</h3><p>{lesson.content ?? (ar ? "لا يوجد نص للدرس بعد." : "Lesson content has not been added yet.")}</p></div></article>)}
        </section>
        <section aria-labelledby="labs-title">
          <h2 id="labs-title">{ar ? "التطبيقات والمختبرات" : "Applied labs"}</h2>
          {course.labs.map((lab) => <article className="academy-course-page__item" key={lab.id}><span>{String(lab.sequence).padStart(2, "0")}</span><div><h3>{lab.title}</h3><p>{lab.instructions ?? (ar ? "لا توجد تعليمات للمختبر بعد." : "Lab instructions have not been added yet.")}</p></div></article>)}
        </section>
        <section aria-labelledby="assessments-title">
          <h2 id="assessments-title">{ar ? "التقييمات" : "Assessments"}</h2>
          {course.exams.map((exam) => <article className="academy-course-page__item" key={exam.id}><span>{exam.passingScore}%</span><div><h3>{exam.title}</h3><p>{ar ? `نوع التقييم: ${exam.assessmentType}` : `Assessment type: ${exam.assessmentType}`}</p></div></article>)}
        </section>
      </article>
    </PlatformShell>
  );
}