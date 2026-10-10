import Link from "next/link";

import { AcademyCourseJourney } from "@/components/academy/academy-course-journey";
import type { AcademyCourseSummary } from "@/components/academy/academy-library";
import { AcademyResourceActions } from "@/components/academy/academy-resource-actions";
import { Icon } from "@/components/ui/icons";
import {
  academyCategories,
  courseMatchesCategory,
  localized,
} from "@/lib/academy/academy-presentation";
import type { AcademyFlowDefinition } from "@/lib/academy/user-academy-routes";
import type { getLearnerAcademySnapshot } from "@/services/academy/learner-portal-service";
import type { Locale } from "@/types/i18n";

type CourseRecord = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  lessons: Array<{ id: string; sequence: number; title: string; content: string | null }>;
  labs: Array<{ id: string; sequence: number; title: string; instructions: string | null }>;
  exams: Array<{ id: string; title: string; passingScore: number; assessmentType: string }>;
  skills: Array<{ skill: { name: string; description: string | null } }>;
};

type LibraryVersion = {
  id: string;
  version: number;
  title: string;
  summary: string | null;
  content: unknown;
  references: unknown;
  changeSummary: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourcePublishedAt: Date | null;
  authorName: string | null;
  approvalState: string;
  createdAt: Date;
};

type LibraryResource = {
  id: string;
  kind: "CERTIFICATE" | "COURSE" | "LEARNING_PATH" | "RESEARCH" | "STUDY" | "WEBINAR";
  slug: string;
  title: string;
  summary: string | null;
  category: string | null;
  language: string;
  currentVersion: number;
  approvalState: string;
  sourceName: string | null;
  sourceUrl: string | null;
  sourcePublishedAt: Date | null;
  authorName: string | null;
  approvedAt: Date | null;
  versions: LibraryVersion[];
  attachments: Array<{
    id: string;
    title: string;
    fileName: string | null;
    mimeType: string | null;
    externalUrl: string | null;
    sourceName: string | null;
  }>;
};

type ResourceEngagement = {
  resourceId: string;
  status: "SAVED" | "REGISTERED" | "IN_PROGRESS" | "COMPLETED";
  progressPercent: number;
};

type LearnerSnapshot = Awaited<ReturnType<typeof getLearnerAcademySnapshot>>;

const detailRoutes = {
  WEBINAR: "/academy/webinar/sample",
  STUDY: "/academy/study/sample",
  RESEARCH: "/academy/research/sample",
  LEARNING_PATH: "/academy/path/sample",
  CERTIFICATE: "/academy/certificates/sample",
  COURSE: "/academy/course/sample",
} as const;

function contentText(content: unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const body = (content as Record<string, unknown>).body;
  return typeof body === "string" ? body : null;
}

function sourceReferences(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { title: string; url?: string; source?: string } =>
    Boolean(item)
    && typeof item === "object"
    && typeof (item as { title?: unknown }).title === "string");
}

function resourceStages(content: unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return [];
  const stages = (content as Record<string, unknown>).stages;
  if (!Array.isArray(stages)) return [];
  return stages.filter((item): item is { title: string; description?: string } =>
    Boolean(item)
    && typeof item === "object"
    && typeof (item as { title?: unknown }).title === "string");
}

function formatDate(value: Date | string | null, locale: Locale) {
  if (!value) return locale === "ar" ? "غير متاح" : "Unavailable";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function ResourceCard({
  detailBase,
  engagement,
  locale,
  resource,
}: {
  detailBase?: string;
  engagement?: ResourceEngagement;
  locale: Locale;
  resource: LibraryResource;
}) {
  const ar = locale === "ar";
  return (
    <article className="academy-resource-card">
      <div className={`academy-resource-card__visual academy-resource-card__visual--${resource.kind.toLocaleLowerCase()}`}>
        <Icon name={resource.kind === "WEBINAR" ? "people" : resource.kind === "LEARNING_PATH" ? "rocket" : resource.kind === "RESEARCH" ? "brain" : "briefcase"} />
        <span>{resource.category ?? resource.kind}</span>
      </div>
      <div className="academy-resource-card__body">
        <header><span>{resource.kind.replaceAll("_", " ")}</span><b>{resource.approvalState}</b></header>
        <h2>{resource.title}</h2>
        <p>{resource.summary ?? (ar ? "لا يوجد ملخص منشور." : "No published summary.")}</p>
        <dl>
          <div><dt>{ar ? "المؤلف" : "Author"}</dt><dd>{resource.authorName ?? (ar ? "غير متاح" : "Unavailable")}</dd></div>
          <div><dt>{ar ? "المصدر" : "Source"}</dt><dd>{resource.sourceName ?? (ar ? "غير متاح" : "Unavailable")}</dd></div>
        </dl>
        {engagement ? <small>{engagement.status.replaceAll("_", " ")}{engagement.progressPercent ? ` · ${engagement.progressPercent}%` : ""}</small> : null}
        <Link className="button button--primary" href={`${detailBase ?? detailRoutes[resource.kind]}?resource=${resource.slug}`}>{ar ? "فتح المحتوى" : "Open content"} <Icon name="arrow" /></Link>
      </div>
    </article>
  );
}

function CourseTile({
  course,
  index,
  locale,
}: {
  course: AcademyCourseSummary;
  index: number;
  locale: Locale;
}) {
  const ar = locale === "ar";
  return (
    <article className={`academy-course-tile academy-course-tile--${(index % 6) + 1}`}>
      <div><Icon name={index % 2 ? "trend" : "briefcase"} /><span>{course.code}</span></div>
      <section>
        <small>{course.field?.name ?? (ar ? "مسار عام" : "General track")}</small>
        <h3>{course.title}</h3>
        <p>{course.description ?? (ar ? "محتوى منظم من سجل الأكاديمية." : "Structured academy content.")}</p>
        <footer>
          <span>{course._count.lessons} {ar ? "دروس" : "lessons"}</span>
          <span>{course._count.exams} {ar ? "تقييمات" : "assessments"}</span>
        </footer>
        <Link className="button button--primary" href={`/academy/courses/${course.id}`}>{ar ? "ابدأ الآن" : "Start now"}</Link>
      </section>
    </article>
  );
}

function EmptyState({
  locale,
  message,
  title,
}: {
  locale: Locale;
  message?: string;
  title?: string;
}) {
  const ar = locale === "ar";
  return (
    <section className="academy-reference__empty">
      <span><Icon name="shield" /></span>
      <strong>{title ?? (ar ? "بانتظار مصدر معتمد" : "Awaiting approved source")}</strong>
      <p>{message ?? (ar ? "لن تعرض Jenan PRO بيانات أو مواعيد أو نتائج تجريبية على أنها بيانات فعلية." : "Jenan PRO will not present demo data, schedules, or results as live records.")}</p>
    </section>
  );
}

function ScreenHeader({
  compact = false,
  definition,
  locale,
  stats,
}: {
  compact?: boolean;
  definition: AcademyFlowDefinition;
  locale: Locale;
  stats?: Array<{ label: string; value: string | number }>;
}) {
  const ar = locale === "ar";
  return (
    <header className={`academy-reference__header${compact ? " academy-reference__header--compact" : ""}`}>
      <div>
        <span className="academy-kicker"><Icon name="graduation" /> JENAN PRO ACADEMY</span>
        <h1>{ar ? definition.title[0] : definition.title[1]}</h1>
        <p>{ar ? definition.description[0] : definition.description[1]}</p>
      </div>
      {stats?.length ? <div className="academy-reference__header-stats">{stats.map((stat) => <article key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></article>)}</div> : null}
    </header>
  );
}

export function AcademyReferenceWorkspace({
  course,
  courses,
  definition,
  engagements,
  learnerName,
  locale,
  query,
  requestedResource,
  resources,
  snapshot,
}: {
  course: CourseRecord | null;
  courses: AcademyCourseSummary[];
  definition: AcademyFlowDefinition;
  engagements: ResourceEngagement[];
  learnerName: string;
  locale: Locale;
  query?: string;
  requestedResource?: string;
  resources: LibraryResource[];
  snapshot: LearnerSnapshot;
}) {
  const ar = locale === "ar";
  const selectedResource = resources.find((item) => item.slug === requestedResource) ?? resources[0] ?? null;
  const selectedVersion = selectedResource?.versions.find((item) => item.version === selectedResource.currentVersion) ?? selectedResource?.versions[0] ?? null;
  const selectedEngagement = engagements.find((item) => item.resourceId === selectedResource?.id);
  const references = sourceReferences(selectedVersion?.references);
  const stages = resourceStages(selectedVersion?.content);
  const liveAttachment = selectedResource?.attachments.find((attachment) =>
    attachment.externalUrl
    && (attachment.mimeType?.startsWith("video/") || attachment.sourceName?.toLocaleLowerCase().includes("stream")));
  const courseMode = definition.kind === "player"
    ? "lesson"
    : definition.kind === "form"
      ? "quiz"
      : definition.kind === "dashboard"
        ? "result"
        : definition.kind === "report"
          ? "certificate"
          : "detail";
  const hasLearnerData = snapshot.enrollments.length > 0
    || snapshot.certificates.length > 0
    || snapshot.engagements.length > 0;
  const connected = definition.source === "resource"
    ? resources.length > 0
    : definition.source === "course"
      ? Boolean(course || courses.length)
      : Boolean(resources.length || courses.length || hasLearnerData);

  let content;

  if (definition.kind === "sections") {
    content = (
      <>
        <ScreenHeader definition={definition} locale={locale} stats={[
          { label: ar ? "قسمًا" : "sections", value: academyCategories.length },
          { label: ar ? "دورة فعلية" : "live courses", value: courses.length },
        ]} />
        <div className="academy-category-grid academy-category-grid--full">
          {academyCategories.map((category) => {
            const count = courses.filter((item) => courseMatchesCategory(item.field?.key, category)).length;
            return (
              <Link className={`academy-category academy-category--${category.color}`} href={category.id === "business" ? "/academy/section/business" : `/academy/courses?category=${category.id}`} key={category.id}>
                <span><Icon name={category.icon} /></span>
                <div><strong>{localized(category.label, ar)}</strong><p>{localized(category.description, ar)}</p><small>{count} {ar ? "دورة" : "courses"}</small></div>
                <Icon name="arrow" />
              </Link>
            );
          })}
        </div>
      </>
    );
  } else if (definition.kind === "category") {
    const category = academyCategories.find((item) => item.id === "business")!;
    const categoryCourses = courses.filter((item) => courseMatchesCategory(item.field?.key, category));
    content = (
      <>
        <ScreenHeader definition={definition} locale={locale} stats={[
          { label: ar ? "دورة" : "courses", value: categoryCourses.length },
          { label: ar ? "درسًا" : "lessons", value: categoryCourses.reduce((total, item) => total + item._count.lessons, 0) },
          { label: ar ? "تقييمًا" : "assessments", value: categoryCourses.reduce((total, item) => total + item._count.exams, 0) },
        ]} />
        {categoryCourses.length ? <div className="academy-course-tiles">{categoryCourses.map((item, index) => <CourseTile course={item} index={index} key={item.id} locale={locale} />)}</div> : <EmptyState locale={locale} title={ar ? "لا توجد دورات في هذا القسم" : "No courses in this section"} />}
      </>
    );
  } else if (["detail", "player", "form", "dashboard", "report"].includes(definition.kind) && course) {
    content = (
      <section className="academy-course-focus">
        <header>
          <div>
            <span className="academy-course-focus__route"><Icon name="graduation" /> {ar ? definition.title[0] : definition.title[1]}</span>
            <small>{course.code}</small>
            <h2>{course.title}</h2>
            <p>{course.description ?? (ar ? "مادة أكاديمية منظمة." : "A structured academy course.")}</p>
          </div>
          <dl><div><dt>{ar ? "الدروس" : "Lessons"}</dt><dd>{course.lessons.length}</dd></div><div><dt>{ar ? "التقييمات" : "Assessments"}</dt><dd>{course.exams.length}</dd></div></dl>
        </header>
        <AcademyCourseJourney course={course} locale={locale} mode={courseMode} />
      </section>
    );
  } else if (definition.kind === "journey") {
    const averageProgress = snapshot.enrollments.length
      ? Math.round(snapshot.enrollments.reduce((total, item) => total + item.progressPercent, 0) / snapshot.enrollments.length)
      : 0;
    content = (
      <>
        <ScreenHeader definition={definition} locale={locale} stats={[
          { label: ar ? "مسجلة" : "enrolled", value: snapshot.enrollments.length },
          { label: ar ? "مكتملة" : "completed", value: snapshot.enrollments.filter((item) => item.status === "COMPLETED").length },
          { label: ar ? "متوسط التقدم" : "average progress", value: `${averageProgress}%` },
        ]} />
        {snapshot.enrollments.length ? <div className="academy-journey-list">{snapshot.enrollments.map((enrollment) => (
          <article key={enrollment.id}>
            <div className="academy-journey-list__visual"><Icon name="graduation" /><span>{enrollment.course.code}</span></div>
            <section>
              <header><div><small>{enrollment.course.field?.name ?? (ar ? "مسار عام" : "General track")}</small><h2>{enrollment.course.title}</h2></div><b>{enrollment.progressPercent}%</b></header>
              <div className="academy-progress"><span style={{ inlineSize: `${enrollment.progressPercent}%` }} /></div>
              <footer>
                <span>{enrollment.completedLessonCount}/{enrollment.course.lessons.length} {ar ? "دروس" : "lessons"}</span>
                <Link className="button button--primary" href={`/academy/courses/${enrollment.course.id}/lesson/1`}>{ar ? "متابعة" : "Continue"}</Link>
              </footer>
            </section>
          </article>
        ))}</div> : <EmptyState locale={locale} message={ar ? "ابدأ دورة من مكتبة الأكاديمية لتظهر رحلتك وتقدمك هنا." : "Start a course from the Academy catalog to see your journey and progress here."} title={ar ? "لم تبدأ رحلة تعليمية بعد" : "No learning journey yet"} />}
      </>
    );
  } else if (definition.kind === "assessments") {
    const enrolledAssessments = snapshot.enrollments.flatMap((enrollment) =>
      enrollment.course.exams.map((exam) => ({ course: enrollment.course, exam })));
    content = (
      <>
        <ScreenHeader definition={definition} locale={locale} stats={[
          { label: ar ? "اختبار متاح" : "available", value: enrolledAssessments.length },
          { label: ar ? "محاولة" : "attempts", value: snapshot.attempts.length },
          { label: ar ? "ناجحة" : "passed", value: snapshot.attempts.filter((item) => item.outcome === "PASSED").length },
        ]} />
        <div className="academy-assessment-layout">
          <section>
            <header><h2>{ar ? "الاختبارات المتاحة" : "Available assessments"}</h2><span>{enrolledAssessments.length}</span></header>
            {enrolledAssessments.length ? enrolledAssessments.map(({ course: enrolledCourse, exam }) => (
              <article key={exam.id}>
                <span><Icon name="check" /></span>
                <div><strong>{exam.title}</strong><small>{enrolledCourse.title} · {ar ? `درجة الاجتياز ${exam.passingScore}%` : `Pass ${exam.passingScore}%`}</small></div>
                <Link href={`/academy/courses/${enrolledCourse.id}/quiz`}>{ar ? "بدء الاختبار" : "Start assessment"}</Link>
              </article>
            )) : <EmptyState locale={locale} message={ar ? "التحق بدورة تحتوي على تقييم منشور ليظهر هنا." : "Enroll in a course with a published assessment to see it here."} />}
          </section>
          <section>
            <header><h2>{ar ? "النتائج السابقة" : "Previous results"}</h2><span>{snapshot.attempts.length}</span></header>
            {snapshot.attempts.length ? snapshot.attempts.map((attempt) => (
              <article key={attempt.id}>
                <span className={attempt.outcome === "PASSED" ? "is-success" : "is-warning"}>{attempt.score}%</span>
                <div><strong>{attempt.exam.title}</strong><small>{attempt.exam.course?.title ?? (ar ? "دورة غير مرتبطة" : "Unlinked course")} · {formatDate(attempt.createdAt, locale)}</small></div>
                <b>{attempt.outcome}</b>
              </article>
            )) : <p className="academy-inline-empty">{ar ? "لا توجد محاولات محفوظة." : "No attempts have been recorded."}</p>}
          </section>
        </div>
      </>
    );
  } else if (definition.kind === "certificate-list") {
    content = (
      <>
        <ScreenHeader definition={definition} locale={locale} stats={[
          { label: ar ? "شهادة مكتسبة" : "earned", value: snapshot.certificates.length },
          { label: ar ? "سارية" : "active", value: snapshot.certificates.filter((item) => item.status === "CERTIFIED").length },
        ]} />
        {snapshot.certificates.length ? <div className="academy-certificate-grid">{snapshot.certificates.map((certificate) => (
          <article key={certificate.id}>
            <div className="academy-certificate-grid__paper">
              <Icon name="shield" />
              <span>JENAN PRO ACADEMY</span>
              <h2>{certificate.certification?.name ?? (ar ? "شهادة إتمام دورة" : "Course completion certificate")}</h2>
              <strong>{learnerName}</strong>
              <p>{certificate.course.title}</p>
              <small>{formatDate(certificate.awardedAt, locale)}</small>
            </div>
            <footer>
              <Link className="button button--primary" href={`/academy/courses/${certificate.course.id}/certificate`}>{ar ? "فتح الشهادة" : "Open certificate"}</Link>
              <Link className="button button--secondary" href={`/academy/verify/${certificate.id}`} target="_blank">{ar ? "التحقق" : "Verify"}</Link>
            </footer>
          </article>
        ))}</div> : <EmptyState locale={locale} message={ar ? "تظهر الشهادات بعد إكمال متطلبات الدورة واجتياز تقييماتها." : "Certificates appear after course requirements and assessments are completed."} title={ar ? "لا توجد شهادات صادرة" : "No certificates issued"} />}
      </>
    );
  } else if (definition.kind === "downloads") {
    const saved = snapshot.engagements.filter((item) => item.status === "SAVED" || item.status === "COMPLETED");
    const attachments = saved.flatMap((item) => item.resource.attachments.map((attachment) => ({ attachment, resource: item.resource })));
    content = (
      <>
        <ScreenHeader definition={definition} locale={locale} stats={[
          { label: ar ? "عنصر محفوظ" : "saved items", value: saved.length },
          { label: ar ? "مرفق معتمد" : "approved files", value: attachments.length },
        ]} />
        <div className="academy-download-layout">
          <section>
            <header><h2>{ar ? "مكتبتي المحفوظة" : "My saved library"}</h2></header>
            {saved.length ? saved.map((item) => <article key={item.id}><span><Icon name="briefcase" /></span><div><strong>{item.resource.title}</strong><small>{item.resource.kind} · {item.status}</small></div><Link href={`${detailRoutes[item.resource.kind]}?resource=${item.resource.slug}`}>{ar ? "فتح" : "Open"}</Link></article>) : <p className="academy-inline-empty">{ar ? "لم تحفظ محتوى بعد." : "No content has been saved yet."}</p>}
          </section>
          <section>
            <header><h2>{ar ? "المرفقات المتاحة" : "Available attachments"}</h2></header>
            {attachments.length ? attachments.map(({ attachment, resource }) => <article key={attachment.id}><span><Icon name="grid" /></span><div><strong>{attachment.title}</strong><small>{resource.title} · {attachment.mimeType ?? (ar ? "نوع غير محدد" : "Type unavailable")}</small></div>{attachment.externalUrl ? <a href={attachment.externalUrl} rel="noreferrer" target="_blank">{ar ? "تنزيل" : "Download"}</a> : <button disabled type="button">{ar ? "غير متاح" : "Unavailable"}</button>}</article>) : <p className="academy-inline-empty">{ar ? "لا توجد مرفقات خارجية قابلة للتنزيل في العناصر المحفوظة." : "No external downloadable attachments are available in saved items."}</p>}
          </section>
        </div>
      </>
    );
  } else if (definition.kind === "obligations") {
    const completedExamIds = new Set(snapshot.attempts.filter((item) => item.outcome === "PASSED").map((item) => item.exam.id));
    const requiredLessons = snapshot.enrollments.flatMap((enrollment) =>
      enrollment.course.lessons
        .filter((lesson) => lesson.learnerCompletions.length === 0)
        .map((lesson) => ({ course: enrollment.course, lesson })));
    const requiredAssessments = snapshot.enrollments.flatMap((enrollment) =>
      enrollment.course.exams
        .filter((exam) => !completedExamIds.has(exam.id))
        .map((exam) => ({ course: enrollment.course, exam })));
    content = (
      <>
        <ScreenHeader definition={definition} locale={locale} stats={[
          { label: ar ? "درس مطلوب" : "required lessons", value: requiredLessons.length },
          { label: ar ? "اختبار مطلوب" : "required assessments", value: requiredAssessments.length },
          { label: ar ? "دروس مكتملة" : "completed lessons", value: snapshot.completedLessons },
        ]} />
        <div className="academy-obligations">
          <section>
            <header><h2>{ar ? "الدروس المطلوبة" : "Required lessons"}</h2><span>{requiredLessons.length}</span></header>
            {requiredLessons.length ? requiredLessons.map(({ course: enrolledCourse, lesson }) => <article key={lesson.id}><span><Icon name="graduation" /></span><div><strong>{lesson.title}</strong><small>{enrolledCourse.title}</small></div><Link href={`/academy/courses/${enrolledCourse.id}/lesson/${lesson.sequence}`}>{ar ? "متابعة" : "Continue"}</Link></article>) : <p className="academy-inline-empty">{ar ? "لا توجد دروس مطلوبة حاليًا." : "No required lessons at this time."}</p>}
          </section>
          <section>
            <header><h2>{ar ? "الاختبارات المطلوبة" : "Required assessments"}</h2><span>{requiredAssessments.length}</span></header>
            {requiredAssessments.length ? requiredAssessments.map(({ course: enrolledCourse, exam }) => <article key={exam.id}><span><Icon name="check" /></span><div><strong>{exam.title}</strong><small>{enrolledCourse.title} · {ar ? `الاجتياز ${exam.passingScore}%` : `Pass ${exam.passingScore}%`}</small></div><Link href={`/academy/courses/${enrolledCourse.id}/quiz`}>{ar ? "بدء الاختبار" : "Start"}</Link></article>) : <p className="academy-inline-empty">{ar ? "لا توجد اختبارات مطلوبة حاليًا." : "No required assessments at this time."}</p>}
          </section>
        </div>
      </>
    );
  } else if (definition.kind === "community") {
    content = (
      <>
        <ScreenHeader definition={definition} locale={locale} stats={[
          { label: ar ? "مصدر معتمد" : "approved resources", value: resources.length },
          { label: ar ? "سياسة نشر" : "publishing policy", value: ar ? "مفعلة" : "Active" },
        ]} />
        <div className="academy-community">
          <section>
            <span><Icon name="people" /></span>
            <h2>{ar ? "مساحة نقاش آمنة وموثوقة" : "A safe, trusted discussion space"}</h2>
            <p>{ar ? "لم يتم توصيل مزود نقاش أكاديمي أو سجل موضوعات معتمد بعد، لذلك لن نعرض منشورات أو أعضاء تجريبيين." : "No approved academic discussion provider or topic registry is connected yet, so demo posts or members will not be shown."}</p>
            <button disabled type="button">{ar ? "إنشاء موضوع — غير متاح حاليًا" : "Create topic — currently unavailable"}</button>
          </section>
          <aside>
            <h3>{ar ? "قواعد المجتمع" : "Community rules"}</h3>
            <ul><li>{ar ? "احترام حقوق الملكية والمصادر." : "Respect sources and intellectual property."}</li><li>{ar ? "عدم نشر بيانات سرية أو شخصية." : "Do not publish confidential or personal data."}</li><li>{ar ? "توثيق الادعاءات المهنية بمصدر." : "Support professional claims with sources."}</li></ul>
            <Link href="/user/unlocks">{ar ? "إدارة وصول المجتمع" : "Manage community access"}</Link>
          </aside>
        </div>
      </>
    );
  } else if (definition.kind === "search") {
    const normalized = query?.trim().toLocaleLowerCase() ?? "";
    const matchedCourses = normalized ? courses.filter((item) => [item.title, item.description, item.code, item.field?.name].filter(Boolean).some((value) => value!.toLocaleLowerCase().includes(normalized))) : [];
    content = (
      <>
        <ScreenHeader compact definition={definition} locale={locale} />
        <form action="/academy/search" className="academy-search-page__form" method="get"><Icon name="search" /><input autoFocus defaultValue={query ?? ""} name="query" placeholder={ar ? "اكتب كلمة البحث..." : "Enter a search term..."} /><button type="submit">{ar ? "بحث" : "Search"}</button></form>
        {!normalized ? <EmptyState locale={locale} message={ar ? "اكتب كلمة للبحث في الدورات والموارد الأكاديمية المعتمدة." : "Enter a term to search live courses and approved academy resources."} title={ar ? "ابدأ البحث" : "Start searching"} /> : (
          <div className="academy-search-results">
            <section><header><h2>{ar ? "الدورات" : "Courses"}</h2><span>{matchedCourses.length}</span></header>{matchedCourses.length ? <div className="academy-course-tiles">{matchedCourses.map((item, index) => <CourseTile course={item} index={index} key={item.id} locale={locale} />)}</div> : <p className="academy-inline-empty">{ar ? "لا توجد دورات مطابقة." : "No matching courses."}</p>}</section>
            <section><header><h2>{ar ? "المصادر المعتمدة" : "Approved resources"}</h2><span>{resources.length}</span></header>{resources.length ? <div className="academy-resource-catalog__grid">{resources.map((resource) => <ResourceCard engagement={engagements.find((item) => item.resourceId === resource.id)} key={resource.id} locale={locale} resource={resource} />)}</div> : <p className="academy-inline-empty">{ar ? "لا توجد مصادر مطابقة." : "No matching resources."}</p>}</section>
          </div>
        )}
      </>
    );
  } else if (definition.kind === "profile") {
    const averageScore = snapshot.attempts.length
      ? Math.round(snapshot.attempts.reduce((total, item) => total + item.score, 0) / snapshot.attempts.length)
      : null;
    content = (
      <>
        <ScreenHeader compact definition={definition} locale={locale} />
        <div className="academy-profile">
          <header>
            <span>{learnerName.trim().charAt(0).toLocaleUpperCase() || "J"}</span>
            <div><h2>{learnerName}</h2><p>{ar ? "متعلم في أكاديمية Jenan PRO" : "Jenan PRO Academy learner"}</p></div>
            <b>{snapshot.enrollments.some((item) => item.status === "COMPLETED") ? (ar ? "متعلم نشط" : "Active learner") : (ar ? "بداية الرحلة" : "Journey started")}</b>
          </header>
          <div className="academy-profile__metrics">
            <article><Icon name="graduation" /><strong>{snapshot.enrollments.length}</strong><span>{ar ? "دورات مسجلة" : "Enrolled courses"}</span></article>
            <article><Icon name="check" /><strong>{snapshot.completedLessons}</strong><span>{ar ? "دروس مكتملة" : "Completed lessons"}</span></article>
            <article><Icon name="shield" /><strong>{snapshot.certificates.length}</strong><span>{ar ? "شهادات" : "Certificates"}</span></article>
            <article><Icon name="trend" /><strong>{averageScore === null ? "—" : `${averageScore}%`}</strong><span>{ar ? "متوسط التقييم" : "Average score"}</span></article>
          </div>
          <section>
            <header><h3>{ar ? "سجل التعلم" : "Learning history"}</h3><Link href="/academy/journey">{ar ? "عرض الرحلة" : "View journey"}</Link></header>
            {snapshot.enrollments.length ? snapshot.enrollments.slice(0, 6).map((enrollment) => <article key={enrollment.id}><span className={enrollment.status === "COMPLETED" ? "is-success" : ""}><Icon name={enrollment.status === "COMPLETED" ? "check" : "graduation"} /></span><div><strong>{enrollment.course.title}</strong><small>{formatDate(enrollment.enrolledAt, locale)} · {enrollment.progressPercent}%</small></div><Link href={`/academy/courses/${enrollment.course.id}`}>{ar ? "فتح" : "Open"}</Link></article>) : <p className="academy-inline-empty">{ar ? "لا يوجد سجل تعلم حتى الآن." : "No learning history yet."}</p>}
          </section>
        </div>
      </>
    );
  } else if (definition.kind === "settings") {
    content = (
      <>
        <ScreenHeader compact definition={definition} locale={locale} />
        <div className="academy-settings">
          <section><span><Icon name="user" /></span><div><h2>{ar ? "الحساب والهوية" : "Account and identity"}</h2><p>{learnerName}</p></div><Link href="/user/onboarding">{ar ? "تحديث البيانات" : "Update profile"}</Link></section>
          <section><span><Icon name="globe" /></span><div><h2>{ar ? "اللغة" : "Language"}</h2><p>{ar ? "العربية هي لغة العرض الحالية. استخدم مبدّل اللغة في الشريط العلوي للتغيير." : "English is the current display language. Use the language switcher in the top bar to change it."}</p></div></section>
          <section><span><Icon name="bell" /></span><div><h2>{ar ? "تنبيهات الأكاديمية" : "Academy notifications"}</h2><p>{ar ? "لا يوجد مزود تنبيهات أكاديمي مخصص متصل حاليًا." : "No dedicated academy notification provider is currently connected."}</p></div><button disabled type="button">{ar ? "غير متاح" : "Unavailable"}</button></section>
          <section><span><Icon name="shield" /></span><div><h2>{ar ? "الخصوصية والأمان" : "Privacy and security"}</h2><p>{ar ? "الملاحظات والتقدم والنتائج خاصة بحسابك ولا تظهر في الروابط العامة." : "Notes, progress, and results remain private to your account."}</p></div><Link href="/user">{ar ? "مركز الحساب" : "Account center"}</Link></section>
        </div>
      </>
    );
  } else if (selectedResource && (definition.kind === "list" || definition.kind === "library")) {
    content = (
      <>
        <ScreenHeader definition={definition} locale={locale} stats={[
          { label: ar ? "سجلًا معتمدًا" : "approved records", value: resources.length },
          { label: ar ? "محفوظًا" : "saved", value: engagements.filter((item) => item.status === "SAVED").length },
        ]} />
        <div className="academy-resource-catalog">
          <form className="academy-resource-search" method="get"><Icon name="search" /><input name="query" defaultValue={query ?? ""} placeholder={ar ? "بحث في العنوان أو المؤلف أو المصدر" : "Search title, author, or source"} /><input name="category" placeholder={ar ? "التصنيف" : "Category"} /><button type="submit">{ar ? "بحث" : "Search"}</button></form>
          <div className="academy-resource-catalog__grid">{resources.map((resource) => <ResourceCard detailBase={definition.kind === "library" ? "/academy/library/sample" : undefined} engagement={engagements.find((item) => item.resourceId === resource.id)} key={resource.id} locale={locale} resource={resource} />)}</div>
        </div>
      </>
    );
  } else if (selectedResource) {
    content = (
      <>
        <ScreenHeader compact definition={definition} locale={locale} />
        <div className="academy-resource-reader">
          <aside>
            <span>{ar ? "السجل المعتمد" : "Approved registry"}</span>
            {resources.map((resource) => <Link href={`${definition.route}?resource=${resource.slug}`} key={resource.id} className={resource.id === selectedResource.id ? "is-active" : ""}><strong>{resource.title}</strong><small>{resource.category ?? resource.kind} · v{resource.currentVersion}</small></Link>)}
          </aside>
          <article>
            <header><div><span>{selectedResource.category ?? selectedResource.language}</span><h2>{selectedVersion?.title ?? selectedResource.title}</h2><p>{selectedVersion?.summary ?? selectedResource.summary}</p></div><strong>{selectedResource.approvalState}</strong></header>
            <AcademyResourceActions initialProgress={selectedEngagement?.progressPercent} initialStatus={selectedEngagement?.status} kind={selectedResource.kind} locale={locale} resourceId={selectedResource.id} />
            <section className="academy-resource-reader__metadata"><div><span>{ar ? "المؤلف" : "Author"}</span><strong>{selectedVersion?.authorName ?? selectedResource.authorName ?? (ar ? "غير متاح" : "Unavailable")}</strong></div><div><span>{ar ? "المصدر" : "Source"}</span><strong>{selectedVersion?.sourceName ?? selectedResource.sourceName ?? (ar ? "غير متاح" : "Unavailable")}</strong></div><div><span>{ar ? "تاريخ المصدر" : "Source date"}</span><strong>{formatDate(selectedVersion?.sourcePublishedAt ?? selectedResource.sourcePublishedAt, locale)}</strong></div><div><span>{ar ? "الإصدار" : "Version"}</span><strong>v{selectedResource.currentVersion}</strong></div></section>
            {definition.kind === "live" ? <section className="academy-live-room"><h3>{ar ? "غرفة البث" : "Live room"}</h3>{liveAttachment?.externalUrl ? <a className="button button--primary" href={liveAttachment.externalUrl} rel="noreferrer" target="_blank">{ar ? "فتح البث المعتمد" : "Open approved stream"}</a> : <EmptyState locale={locale} message={ar ? "تم اعتماد محتوى الندوة، لكن لا يوجد رابط بث صالح من مزود معتمد." : "The webinar is approved, but no valid stream URL is connected from an approved provider."} title={ar ? "البث غير متصل" : "Stream not connected"} />}</section> : null}
            {definition.kind === "timeline" ? <section className="academy-path-timeline"><h3>{ar ? "مراحل المسار" : "Path stages"}</h3>{stages.length ? stages.map((stage, index) => <article key={`${stage.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{stage.title}</strong><p>{stage.description ?? (ar ? "مرحلة موثقة ضمن المسار." : "A documented stage in this path.")}</p></div></article>) : <p>{ar ? "لا توجد مراحل منظمة في الإصدار المعتمد." : "No structured stages are present in the approved version."}</p>}</section> : null}
            <div className="academy-resource-reader__body">{contentText(selectedVersion?.content) ?? (ar ? "لا يوجد نص منشور في الإصدار الحالي." : "No published body is available in the current version.")}</div>
            <section><h3>{ar ? "المراجع" : "References"}</h3>{references.length ? <ul>{references.map((reference) => <li key={`${reference.title}-${reference.url ?? ""}`}>{reference.url ? <a href={reference.url} rel="noreferrer" target="_blank">{reference.title}</a> : reference.title}{reference.source ? <small>{reference.source}</small> : null}</li>)}</ul> : <p>{ar ? "لا توجد مراجع مضافة." : "No references have been added."}</p>}</section>
            <section><h3>{ar ? "المرفقات" : "Attachments"}</h3>{selectedResource.attachments.length ? <ul>{selectedResource.attachments.map((attachment) => <li key={attachment.id}>{attachment.externalUrl ? <a href={attachment.externalUrl} rel="noreferrer" target="_blank">{attachment.title}</a> : attachment.title}<small>{attachment.mimeType ?? attachment.sourceName ?? (ar ? "محفوظ لدى مزود التخزين" : "Stored by storage provider")}</small></li>)}</ul> : <p>{ar ? "لا توجد مرفقات معتمدة." : "No approved attachments."}</p>}</section>
          </article>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <ScreenHeader definition={definition} locale={locale} />
        <EmptyState locale={locale} />
      </>
    );
  }

  return (
    <section
      className="academy-reference"
      data-academy-kind={definition.kind}
      data-academy-route={definition.route}
      data-academy-source={connected ? "CONNECTED" : "AWAITING_APPROVED_SOURCE"}
    >
      {content}
    </section>
  );
}
