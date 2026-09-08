"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/types/i18n";

type AcademyCourse = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  field: { key: string; name: string } | null;
  specialization: { name: string } | null;
  _count: { lessons: number; labs: number; exams: number };
};

const categories = [
  { id: "all", ar: "كل المسارات", en: "All tracks", keys: [] },
  { id: "business", ar: "المال والأعمال", en: "Finance and business", keys: ["finance", "accounting", "cost-optimization", "management"] },
  { id: "projects", ar: "المشاريع والريادة", en: "Projects and entrepreneurship", keys: ["product-project-management", "entrepreneurship", "architecture"] },
  { id: "workforce", ar: "العمال والموظفون", en: "Workforce and HR", keys: ["human-resources", "supervision", "management"] },
  { id: "commerce", ar: "التجارة الإلكترونية", en: "E-commerce", keys: ["ecommerce", "sales", "marketing"] },
  { id: "research", ar: "الأبحاث والابتكار", en: "Research and innovation", keys: ["innovation-rnd", "ai-engineering", "database-data-engineering"] },
] as const;

function matchesCategory(course: AcademyCourse, keys: readonly string[]) {
  if (!keys.length) return true;
  const key = course.field?.key ?? "";
  return keys.some((candidate) => key.includes(candidate));
}

export function AcademyLibrary({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [courses, setCourses] = useState<AcademyCourse[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<(typeof categories)[number]["id"]>("all");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/academy/catalog", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalog request failed");
        return (await response.json()) as { courses: AcademyCourse[] };
      })
      .then((payload) => {
        if (active) setCourses(payload.courses);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const category = categories.find((item) => item.id === selectedCategory) ?? categories[0];
  const visibleCourses = courses.filter((course) => matchesCategory(course, category.keys));

  return (
    <section className="academy-library" aria-labelledby="academy-library-title" aria-busy={loading}>
      <header className="academy-library__header">
        <div>
          <span className="eyebrow eyebrow--small">JENAN ACADEMY</span>
          <h1 id="academy-library-title">{ar ? "أكاديمية جنان للأعمال" : "Jenan Academy for Business"}</h1>
          <p>{ar ? "دورات ودروس منظمة من السجل الأكاديمي في المال والأعمال والمشاريع والموارد البشرية والتجارة الإلكترونية." : "Structured courses and lessons from the academy registry for finance, business, projects, workforce, and e-commerce."}</p>
        </div>
        <div className="academy-library__count" aria-live="polite">
          <strong>{courses.length}</strong>
          <span>{ar ? "مسار متاح" : "available tracks"}</span>
        </div>
      </header>

      <div className="academy-library__filters" role="tablist" aria-label={ar ? "تصنيفات الأكاديمية" : "Academy categories"}>
        {categories.map((item) => (
          <button
            aria-selected={selectedCategory === item.id}
            className={selectedCategory === item.id ? "is-active" : ""}
            key={item.id}
            onClick={() => setSelectedCategory(item.id)}
            role="tab"
            type="button"
          >
            {ar ? item.ar : item.en}
          </button>
        ))}
      </div>

      {loading ? <p className="academy-library__state" role="status">{ar ? "جارٍ تحميل المحتوى الأكاديمي..." : "Loading academy content..."}</p> : null}
      {failed ? <p className="academy-library__state academy-library__state--error" role="alert">{ar ? "تعذر تحميل المحتوى الأكاديمي. حدّث الصفحة للمحاولة مجدداً." : "Academy content could not be loaded. Refresh the page to try again."}</p> : null}
      {!loading && !failed ? (
        <div className="academy-library__grid">
          {visibleCourses.map((course) => (
            <article className="academy-course" key={course.id}>
              <div className="academy-course__meta">
                <span>{course.code}</span>
                <span>{course.field?.name ?? (ar ? "مسار عام" : "General track")}</span>
              </div>
              <h2>{course.title}</h2>
              <p>{course.description ?? (ar ? "محتوى منظّم في سجل الأكاديمية." : "Structured content in the academy registry.")}</p>
              <dl>
                <div><dt>{ar ? "دروس" : "Lessons"}</dt><dd>{course._count.lessons}</dd></div>
                <div><dt>{ar ? "مختبرات" : "Labs"}</dt><dd>{course._count.labs}</dd></div>
                <div><dt>{ar ? "تقييمات" : "Assessments"}</dt><dd>{course._count.exams}</dd></div>
              </dl>
              <Link className="button button--secondary" href={`/academy/courses/${course.id}`}>
                {ar ? "فتح المحتوى" : "Open content"}
              </Link>
            </article>
          ))}
          {!visibleCourses.length ? <p className="academy-library__state">{ar ? "لا توجد مواد في هذا التصنيف بعد." : "No courses are available in this category yet."}</p> : null}
        </div>
      ) : null}
    </section>
  );
}