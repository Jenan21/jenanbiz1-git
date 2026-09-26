import Link from "next/link";
import { AcademySectionNav } from "@/components/academy/academy-section-nav";
import { CourseLearningProgress } from "@/components/academy/course-learning-progress";
import type { AcademyFlowDefinition } from "@/lib/academy/user-academy-routes";
import type { Locale } from "@/types/i18n";

type CourseRecord = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  lessons: Array<{ id: string; sequence: number; title: string; content: string | null }>;
  labs: Array<{ id: string; sequence: number; title: string; instructions: string | null }>;
  exams: Array<{ id: string; title: string; passingScore: number; assessmentType: string }>;
};

export function AcademyReferenceWorkspace({ course, definition, locale }: { course: CourseRecord | null; definition: AcademyFlowDefinition; locale: Locale }) {
  const ar = locale === "ar";
  const activeRoot = definition.route.includes("/course/") || definition.route.startsWith("/academy/certificates") ? "/academy/courses" : definition.route;
  return <section className="academy-reference"><AcademySectionNav activeRoute={activeRoot} locale={locale} /><header className="academy-reference__header"><div><span className="eyebrow eyebrow--small">JENAN PRO / {definition.kind.toUpperCase()}</span><h1>{ar ? definition.title[0] : definition.title[1]}</h1><p>{ar ? definition.description[0] : definition.description[1]}</p></div><span>{course ? course.code : (ar ? "بانتظار المصدر" : "Awaiting source")}</span></header><div className="academy-reference__signals">{definition.sections.map(([arabic, english], index) => <article key={arabic}><span>{String(index + 1).padStart(2, "0")}</span><strong>{ar ? arabic : english}</strong><small>{course ? (ar ? "مرتبط بسجل الدورة" : "Connected to course record") : (ar ? "لا توجد بيانات حتى الآن" : "No data yet")}</small></article>)}</div>{course ? <><section className="academy-reference__course"><header><div><span>{course.code}</span><h2>{course.title}</h2><p>{course.description ?? (ar ? "لا يوجد وصف للدورة." : "No course description is available.")}</p></div><Link className="button button--secondary" href={`/academy/courses/${course.id}`}>{ar ? "فتح صفحة الدورة" : "Open course page"}</Link></header><CourseLearningProgress courseId={course.id} exams={course.exams} lessons={course.lessons.map(({ id, title }) => ({ id, title }))} locale={locale} /><div className="academy-reference__content"><section><h3>{ar ? "الدروس" : "Lessons"}</h3>{course.lessons.map((lesson) => <article key={lesson.id}><span>{String(lesson.sequence).padStart(2, "0")}</span><div><strong>{lesson.title}</strong><p>{lesson.content ?? (ar ? "المحتوى غير متوفر." : "Content unavailable.")}</p></div></article>)}</section><section><h3>{ar ? "المختبرات" : "Labs"}</h3>{course.labs.map((lab) => <article key={lab.id}><span>{String(lab.sequence).padStart(2, "0")}</span><div><strong>{lab.title}</strong><p>{lab.instructions ?? (ar ? "التعليمات غير متوفرة." : "Instructions unavailable.")}</p></div></article>)}</section></div></section></> : <section className="academy-reference__empty"><strong>{ar ? "لا يوجد مصدر محتوى متصل" : "No content source connected"}</strong><p>{ar ? "لن تعرض Jenan PRO مواعيد أو متحدثين أو أبحاثاً تجريبية على أنها بيانات فعلية." : "Jenan PRO will not present demo schedules, speakers, or research as live data."}</p><button className="button button--secondary" disabled type="button">{ar ? "الميزة بانتظار المصدر" : "Awaiting source"}</button></section>}</section>;
}