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
  lessons: Array<{
    id: string;
    sequence: number;
    title: string;
    content: string | null;
  }>;
  labs: Array<{
    id: string;
    sequence: number;
    title: string;
    instructions: string | null;
  }>;
  exams: Array<{
    id: string;
    title: string;
    passingScore: number;
    assessmentType: string;
  }>;
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
  attachments: Array<{ id: string; title: string; fileName: string | null; mimeType: string | null; externalUrl: string | null; sourceName: string | null }>;
};

function contentText(content: unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const body = (content as Record<string, unknown>).body;
  return typeof body === "string" ? body : null;
}

function references(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { title: string; url?: string; source?: string } => Boolean(item) && typeof item === "object" && typeof (item as { title?: unknown }).title === "string");
}

export function AcademyReferenceWorkspace({
  course,
  definition,
  locale,
  requestedResource,
  resources,
}: {
  course: CourseRecord | null;
  definition: AcademyFlowDefinition;
  locale: Locale;
  requestedResource?: string;
  resources: LibraryResource[];
}) {
  const ar = locale === "ar";
  const selectedResource = resources.find((item) => item.slug === requestedResource) ?? resources[0] ?? null;
  const selectedVersion = selectedResource?.versions.find((item) => item.version === selectedResource.currentVersion) ?? selectedResource?.versions[0] ?? null;
  const sourceReferences = references(selectedVersion?.references);
  const activeRoot =
    definition.route.includes("/course/") ||
    definition.route.startsWith("/academy/certificates")
      ? "/academy/courses"
      : definition.route;
  return (
    <section className="academy-reference" data-academy-route={definition.route} data-academy-kind={definition.kind} data-academy-source={course || selectedResource ? "CONNECTED" : "AWAITING_APPROVED_SOURCE"}>
      <AcademySectionNav activeRoute={activeRoot} locale={locale} />
      <header className="academy-reference__header">
        <div>
          <span className="eyebrow eyebrow--small">
            JENAN PRO / {definition.kind.toUpperCase()}
          </span>
          <h1>{ar ? definition.title[0] : definition.title[1]}</h1>
          <p>{ar ? definition.description[0] : definition.description[1]}</p>
        </div>
        <span>
          {course?.code ?? selectedResource?.approvalState ?? (ar ? "بانتظار مصدر معتمد" : "Awaiting approved source")}
        </span>
      </header>
      <div className="academy-reference__signals">
        {definition.sections.map(([arabic, english], index) => (
          <article key={arabic}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{ar ? arabic : english}</strong>
            <small>
              {course || selectedResource
                ? ar
                  ? "مرتبط بسجل معتمد"
                  : "Connected to an approved record"
                : ar
                  ? "لا توجد بيانات حتى الآن"
                  : "No data yet"}
            </small>
          </article>
        ))}
      </div>
      {course ? (
        <>
          <section className="academy-reference__course">
            <header>
              <div>
                <span>{course.code}</span>
                <h2>{course.title}</h2>
                <p>
                  {course.description ??
                    (ar
                      ? "لا يوجد وصف للدورة."
                      : "No course description is available.")}
                </p>
              </div>
              <Link
                className="button button--secondary"
                href={`/academy/courses/${course.id}`}
              >
                {ar ? "فتح صفحة الدورة" : "Open course page"}
              </Link>
            </header>
            <CourseLearningProgress
              courseId={course.id}
              exams={course.exams}
              lessons={course.lessons.map(({ id, title }) => ({ id, title }))}
              locale={locale}
            />
            <div className="academy-reference__content">
              <section>
                <h3>{ar ? "الدروس" : "Lessons"}</h3>
                {course.lessons.map((lesson) => (
                  <article key={lesson.id}>
                    <span>{String(lesson.sequence).padStart(2, "0")}</span>
                    <div>
                      <strong>{lesson.title}</strong>
                      <p>
                        {lesson.content ??
                          (ar ? "المحتوى غير متوفر." : "Content unavailable.")}
                      </p>
                    </div>
                  </article>
                ))}
              </section>
              <section>
                <h3>{ar ? "المختبرات" : "Labs"}</h3>
                {course.labs.map((lab) => (
                  <article key={lab.id}>
                    <span>{String(lab.sequence).padStart(2, "0")}</span>
                    <div>
                      <strong>{lab.title}</strong>
                      <p>
                        {lab.instructions ??
                          (ar
                            ? "التعليمات غير متوفرة."
                            : "Instructions unavailable.")}
                      </p>
                    </div>
                  </article>
                ))}
              </section>
            </div>
          </section>
        </>
      ) : selectedResource ? (
        <div className="academy-library">
          <form className="academy-library__search" method="get">
            <input name="query" defaultValue="" placeholder={ar ? "بحث في العنوان أو المؤلف أو المصدر" : "Search title, author, or source"} />
            <input name="category" defaultValue={selectedResource.category ?? ""} placeholder={ar ? "التصنيف" : "Category"} />
            <button className="button button--secondary" type="submit">{ar ? "بحث" : "Search"}</button>
          </form>
          <div className="academy-library__layout">
            <nav aria-label={ar ? "سجل المحتوى المعتمد" : "Approved content registry"}>
              {resources.map((resource) => <Link href={`${definition.route}?resource=${resource.slug}`} key={resource.id} className={resource.id === selectedResource.id ? "active" : ""}><strong>{resource.title}</strong><span>{resource.category ?? (ar ? "غير مصنف" : "Uncategorized")} · v{resource.currentVersion}</span></Link>)}
            </nav>
            <article className="academy-library__reader">
              <header><div><span>{selectedResource.category ?? selectedResource.language}</span><h2>{selectedVersion?.title ?? selectedResource.title}</h2><p>{selectedVersion?.summary ?? selectedResource.summary}</p></div><strong>{selectedResource.approvalState}</strong></header>
              <section className="academy-library__metadata"><div><span>{ar ? "المؤلف" : "Author"}</span><strong>{selectedVersion?.authorName ?? selectedResource.authorName ?? (ar ? "غير متاح" : "Unavailable")}</strong></div><div><span>{ar ? "المصدر" : "Source"}</span><strong>{selectedVersion?.sourceName ?? selectedResource.sourceName ?? (ar ? "غير متاح" : "Unavailable")}</strong></div><div><span>{ar ? "تاريخ المصدر" : "Source date"}</span><strong>{selectedVersion?.sourcePublishedAt ? new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "medium" }).format(selectedVersion.sourcePublishedAt) : ar ? "غير متاح" : "Unavailable"}</strong></div><div><span>{ar ? "الإصدار" : "Version"}</span><strong>v{selectedResource.currentVersion}</strong></div></section>
              <div className="academy-library__body">{contentText(selectedVersion?.content) ?? (ar ? "لا يوجد نص منشور في الإصدار الحالي." : "No published body is available in the current version.")}</div>
              <section><h3>{ar ? "المراجع" : "References"}</h3>{sourceReferences.length ? <ul>{sourceReferences.map((reference) => <li key={`${reference.title}-${reference.url ?? ""}`}>{reference.url ? <a href={reference.url} rel="noreferrer" target="_blank">{reference.title}</a> : reference.title}{reference.source ? <small>{reference.source}</small> : null}</li>)}</ul> : <p>{ar ? "لا توجد مراجع مضافة." : "No references have been added."}</p>}</section>
              <section><h3>{ar ? "المرفقات" : "Attachments"}</h3>{selectedResource.attachments.length ? <ul>{selectedResource.attachments.map((attachment) => <li key={attachment.id}>{attachment.externalUrl ? <a href={attachment.externalUrl} rel="noreferrer" target="_blank">{attachment.title}</a> : attachment.title}<small>{attachment.mimeType ?? attachment.sourceName ?? (ar ? "محفوظ لدى مزود التخزين" : "Stored by storage provider")}</small></li>)}</ul> : <p>{ar ? "لا توجد مرفقات معتمدة." : "No approved attachments."}</p>}</section>
              <details><summary>{ar ? "سجل الإصدارات" : "Version history"}</summary>{selectedResource.versions.map((version) => <article key={version.id}><strong>v{version.version} · {version.approvalState}</strong><span>{new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "medium" }).format(version.createdAt)}</span><p>{version.changeSummary ?? (ar ? "لا يوجد ملخص تغيير." : "No change summary.")}</p></article>)}</details>
            </article>
          </div>
        </div>
      ) : (
        <section className="academy-reference__empty">
          <strong>
            {ar ? "بانتظار مصدر معتمد" : "Awaiting approved source"}
          </strong>
          <p>
            {ar
              ? "لن تعرض Jenan PRO مواعيد أو متحدثين أو أبحاثاً تجريبية على أنها بيانات فعلية."
              : "Jenan PRO will not present demo schedules, speakers, or research as live data."}
          </p>
          <form className="academy-library__search" method="get"><input name="query" placeholder={ar ? "بحث في السجل" : "Search registry"} /><input name="category" placeholder={ar ? "التصنيف" : "Category"} /><button className="button button--secondary" type="submit">{ar ? "بحث" : "Search"}</button></form>
        </section>
      )}
    </section>
  );
}
