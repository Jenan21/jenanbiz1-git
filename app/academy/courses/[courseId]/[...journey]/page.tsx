import { notFound } from "next/navigation";

import { AcademyCourseJourney } from "@/components/academy/academy-course-journey";
import { AcademyShell } from "@/components/academy/academy-shell";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { Locale } from "@/types/i18n";

const journeyModes = {
  certificate: "certificate",
  lesson: "lesson",
  quiz: "quiz",
  result: "result",
} as const;

export default async function AcademyCourseJourneyPage({
  params,
}: {
  params: Promise<{ courseId: string; journey: string[] }>;
}) {
  const [{ courseId, journey }, { locale }, user] = await Promise.all([
    params,
    getRequestDictionary(),
    requireUser("/academy/courses"),
  ]);
  const mode = journeyModes[journey[0] as keyof typeof journeyModes];
  if (!mode || (mode !== "lesson" && journey.length > 1) || (mode === "lesson" && journey.length > 2)) notFound();

  const course = await db.academyCourse.findUnique({
    where: { id: courseId },
    include: {
      field: true,
      specialization: true,
      lessons: { orderBy: { sequence: "asc" } },
      labs: { orderBy: { sequence: "asc" } },
      exams: { orderBy: { createdAt: "asc" } },
      skills: { include: { skill: true } },
    },
  });
  if (!course) notFound();

  return (
    <AcademyShell
      activeRoute={mode === "certificate" ? "/academy/certificates" : "/academy/courses"}
      locale={locale as Locale}
      userLabel={user.profile?.displayName ?? user.email}
    >
      <section className="academy-reference" data-academy-route={`/academy/courses/${course.id}/${journey.join("/")}`}>
        <header className="academy-reference__header academy-reference__header--course">
          <div>
            <span className="eyebrow eyebrow--small">{course.code}</span>
            <h1>{course.title}</h1>
            <p>{course.description ?? (locale === "ar" ? "مادة أكاديمية منظمة." : "A structured academy course.")}</p>
          </div>
        </header>
        <AcademyCourseJourney course={course} locale={locale as Locale} mode={mode} />
      </section>
    </AcademyShell>
  );
}
