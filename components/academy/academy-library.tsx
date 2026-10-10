"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Icon, type IconName } from "@/components/ui/icons";
import {
  academyCategories,
  courseMatchesCategory,
  localized,
} from "@/lib/academy/academy-presentation";
import type { Locale } from "@/types/i18n";

export type AcademyCourseSummary = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  field: { key: string; name: string } | null;
  specialization: { name: string } | null;
  _count: { lessons: number; labs: number; exams: number };
};

type AcademyOverview = {
  certificates: number;
  completedEnrollments: number;
  enrollments: number;
  lessons: number;
  resources: Record<string, number>;
};

const emptyOverview: AcademyOverview = {
  certificates: 0,
  completedEnrollments: 0,
  enrollments: 0,
  lessons: 0,
  resources: {},
};

const featureLinks: ReadonlyArray<{
  href: string;
  icon: IconName;
  label: readonly [string, string];
}> = [
  { href: "/academy/courses", icon: "graduation", label: ["دورات متقدمة", "Advanced courses"] },
  { href: "/academy/research", icon: "brain", label: ["أبحاث وتقارير", "Research and reports"] },
  { href: "/academy/webinars", icon: "people", label: ["ندوات ولقاءات", "Webinars and sessions"] },
  { href: "/academy/studies", icon: "briefcase", label: ["دراسات وحالات", "Studies and cases"] },
  { href: "/academy/paths", icon: "rocket", label: ["مسارات تعليمية", "Learning paths"] },
];

function CourseCard({
  ar,
  course,
  index,
}: {
  ar: boolean;
  course: AcademyCourseSummary;
  index: number;
}) {
  return (
    <article className={`academy-course-card academy-course-card--${(index % 6) + 1}`}>
      <div className="academy-course-card__visual" aria-hidden="true">
        <span>{course.code.slice(0, 3).toLocaleUpperCase()}</span>
        <Icon name={index % 2 ? "trend" : "briefcase"} />
      </div>
      <div className="academy-course-card__body">
        <div className="academy-course-card__meta">
          <span>{course.field?.name ?? (ar ? "مسار عام" : "General")}</span>
          <span>{course._count.lessons} {ar ? "دروس" : "lessons"}</span>
        </div>
        <h3>{course.title}</h3>
        <p>{course.description ?? (ar ? "محتوى منظم من سجل الأكاديمية." : "Structured content from the academy registry.")}</p>
        <footer>
          <span><Icon name="check" /> {course._count.exams} {ar ? "تقييم" : "assessments"}</span>
          <Link href={`/academy/courses/${course.id}`}>{ar ? "ابدأ الآن" : "Start now"} <Icon name="arrow" /></Link>
        </footer>
      </div>
    </article>
  );
}

export function AcademyLibrary({
  initialCategory,
  locale,
  route = "/academy",
}: {
  initialCategory?: string;
  locale: Locale;
  route?: "/academy" | "/academy/courses";
}) {
  const ar = locale === "ar";
  const [courses, setCourses] = useState<AcademyCourseSummary[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(
    initialCategory && academyCategories.some((item) => item.id === initialCategory)
      ? initialCategory
      : "all",
  );
  const [query, setQuery] = useState("");
  const [overview, setOverview] = useState<AcademyOverview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/academy/catalog", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalog request failed");
        return (await response.json()) as {
          courses: AcademyCourseSummary[];
          overview: AcademyOverview;
        };
      })
      .then((payload) => {
        if (active) {
          setCourses(payload.courses);
          setOverview(payload.overview);
        }
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

  const visibleCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const category = academyCategories.find((item) => item.id === selectedCategory);
    return courses.filter((course) => {
      const matchesCategory = !category || courseMatchesCategory(course.field?.key, category);
      const matchesQuery = !normalizedQuery || [
        course.title,
        course.description,
        course.code,
        course.field?.name,
        course.specialization?.name,
      ].filter(Boolean).some((value) => value!.toLocaleLowerCase().includes(normalizedQuery));
      return matchesCategory && matchesQuery;
    });
  }, [courses, query, selectedCategory]);

  const categoryCounts = useMemo(
    () => Object.fromEntries(academyCategories.map((category) => [
      category.id,
      courses.filter((course) => courseMatchesCategory(course.field?.key, category)).length,
    ])),
    [courses],
  );

  if (route === "/academy") {
    const metrics = [
      { icon: "graduation" as const, label: ar ? "دورة متاحة" : "Available courses", value: courses.length },
      { icon: "people" as const, label: ar ? "دورة مسجلة" : "Enrolled courses", value: overview.enrollments },
      { icon: "check" as const, label: ar ? "دورة مكتملة" : "Completed courses", value: overview.completedEnrollments },
      { icon: "shield" as const, label: ar ? "شهادة مكتسبة" : "Certificates earned", value: overview.certificates },
    ];

    return (
      <section className="academy-home" aria-busy={loading} data-academy-route="/academy" data-academy-kind="dashboard">
        <header className="academy-home__hero">
          <div>
            <span className="academy-kicker"><Icon name="sparkles" /> JENAN PRO ACADEMY</span>
            <h1>{ar ? "أكاديمية جنان" : "Jenan Academy"}</h1>
            <p>{ar ? "تعلّم، طوّر مهاراتك، واصنع مستقبلك المهني من محتوى موثق ومسارات عملية." : "Learn, grow your skills, and build your professional future with verified content and practical paths."}</p>
            <form action="/academy/search" className="academy-home__search" method="get">
              <input name="query" placeholder={ar ? "ابحث عن دورة أو موضوع أو مهارة..." : "Search for a course, topic, or skill..."} />
              <button type="submit" aria-label={ar ? "بحث" : "Search"}><Icon name="search" /></button>
            </form>
          </div>
          <div className="academy-home__hero-art" aria-hidden="true">
            <span className="academy-home__orbit academy-home__orbit--one" />
            <span className="academy-home__orbit academy-home__orbit--two" />
            <Icon name="graduation" />
          </div>
        </header>

        <div className="academy-home__features">
          {featureLinks.map((item) => (
            <Link href={item.href} key={item.href}>
              <span><Icon name={item.icon} /></span>
              <strong>{localized(item.label, ar)}</strong>
              <Icon name="arrow" />
            </Link>
          ))}
        </div>

        <div className="academy-home__metrics">
          {metrics.map((metric) => (
            <article key={metric.label}>
              <span><Icon name={metric.icon} /></span>
              <strong>{loading ? "—" : metric.value}</strong>
              <small>{metric.label}</small>
            </article>
          ))}
        </div>

        <section className="academy-home__section">
          <header>
            <div><span>{ar ? "استكشف حسب المجال" : "Explore by field"}</span><h2>{ar ? "أقسام الأكاديمية" : "Academy sections"}</h2></div>
            <Link href="/academy/sections">{ar ? "عرض كل الأقسام" : "View all sections"} <Icon name="arrow" /></Link>
          </header>
          <div className="academy-category-grid academy-category-grid--home">
            {academyCategories.slice(0, 6).map((category) => (
              <Link className={`academy-category academy-category--${category.color}`} href={category.id === "business" ? "/academy/section/business" : `/academy/courses?category=${category.id}`} key={category.id}>
                <span><Icon name={category.icon} /></span>
                <div>
                  <strong>{localized(category.label, ar)}</strong>
                  <small>{categoryCounts[category.id] ?? 0} {ar ? "دورة" : "courses"}</small>
                </div>
                <Icon name="arrow" />
              </Link>
            ))}
          </div>
        </section>

        <section className="academy-home__section">
          <header>
            <div><span>{ar ? "من السجل الفعلي" : "From the live registry"}</span><h2>{ar ? "أحدث الدورات" : "Latest courses"}</h2></div>
            <Link href="/academy/courses">{ar ? "جميع الدورات" : "All courses"} <Icon name="arrow" /></Link>
          </header>
          {failed ? <p className="academy-library__state academy-library__state--error">{ar ? "تعذر تحميل الدورات. حدّث الصفحة للمحاولة مجددًا." : "Courses could not be loaded. Refresh to try again."}</p> : null}
          {!loading && !failed && courses.length ? <div className="academy-course-grid">{courses.slice(0, 4).map((course, index) => <CourseCard ar={ar} course={course} index={index} key={course.id} />)}</div> : null}
          {!loading && !failed && !courses.length ? <p className="academy-library__state">{ar ? "لا توجد دورات منشورة حاليًا." : "No courses are published yet."}</p> : null}
        </section>
      </section>
    );
  }

  return (
    <section className="academy-catalog" aria-busy={loading} data-academy-route="/academy/courses" data-academy-kind="list">
      <header className="academy-catalog__hero">
        <div>
          <span className="academy-kicker"><Icon name="graduation" /> JENAN PRO ACADEMY</span>
          <h1>{ar ? "جميع الدورات" : "All courses"}</h1>
          <p>{ar ? "استكشف الدورات الفعلية المتاحة في سجل الأكاديمية حسب المجال والتخصص." : "Explore live academy courses by field and specialization."}</p>
        </div>
        <div><strong>{loading ? "—" : courses.length}</strong><span>{ar ? "دورة متاحة" : "available courses"}</span></div>
      </header>

      <div className="academy-catalog__toolbar">
        <label><Icon name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "ابحث بعنوان الدورة أو المجال..." : "Search course title or field..."} /></label>
        <div role="tablist" aria-label={ar ? "تصفية الدورات" : "Filter courses"}>
          <button aria-selected={selectedCategory === "all"} className={selectedCategory === "all" ? "is-active" : ""} onClick={() => setSelectedCategory("all")} role="tab" type="button">{ar ? "الكل" : "All"}</button>
          {academyCategories.slice(0, 6).map((category) => (
            <button aria-selected={selectedCategory === category.id} className={selectedCategory === category.id ? "is-active" : ""} key={category.id} onClick={() => setSelectedCategory(category.id)} role="tab" type="button">{localized(category.label, ar)}</button>
          ))}
        </div>
      </div>

      {loading ? <p className="academy-library__state" role="status">{ar ? "جارٍ تحميل المحتوى الأكاديمي..." : "Loading academy content..."}</p> : null}
      {failed ? <p className="academy-library__state academy-library__state--error" role="alert">{ar ? "تعذر تحميل المحتوى الأكاديمي. حدّث الصفحة للمحاولة مجددًا." : "Academy content could not be loaded. Refresh to try again."}</p> : null}
      {!loading && !failed && visibleCourses.length ? <div className="academy-course-grid">{visibleCourses.map((course, index) => <CourseCard ar={ar} course={course} index={index} key={course.id} />)}</div> : null}
      {!loading && !failed && !visibleCourses.length ? <p className="academy-library__state">{ar ? "لا توجد دورات تطابق البحث أو التصنيف." : "No courses match the search or category."}</p> : null}
    </section>
  );
}
