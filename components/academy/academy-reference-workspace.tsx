import Link from "next/link";
import { AcademySectionNav } from "@/components/academy/academy-section-nav";
import { AcademyCourseJourney } from "@/components/academy/academy-course-journey";
import { AcademyResourceActions } from "@/components/academy/academy-resource-actions";
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
  attachments: Array<{ id: string; title: string; fileName: string | null; mimeType: string | null; externalUrl: string | null; sourceName: string | null }>;
};

type ResourceEngagement = { resourceId: string; status: "SAVED" | "REGISTERED" | "IN_PROGRESS" | "COMPLETED"; progressPercent: number };

function contentText(content: unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const body = (content as Record<string, unknown>).body;
  return typeof body === "string" ? body : null;
}

function references(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { title: string; url?: string; source?: string } => Boolean(item) && typeof item === "object" && typeof (item as { title?: unknown }).title === "string");
}

function resourceStages(content: unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return [];
  const stages = (content as Record<string, unknown>).stages;
  if (!Array.isArray(stages)) return [];
  return stages.filter((item): item is { title: string; description?: string } => Boolean(item) && typeof item === "object" && typeof (item as { title?: unknown }).title === "string");
}

const detailRoutes = {
  WEBINAR: "/academy/webinar/sample",
  STUDY: "/academy/study/sample",
  RESEARCH: "/academy/research/sample",
  LEARNING_PATH: "/academy/path/sample",
  CERTIFICATE: "/academy/certificates/sample",
  COURSE: "/academy/course/sample",
} as const;

export function AcademyReferenceWorkspace({
  course,
  definition,
  engagements,
  locale,
  requestedResource,
  resources,
}: {
  course: CourseRecord | null;
  definition: AcademyFlowDefinition;
  engagements: ResourceEngagement[];
  locale: Locale;
  requestedResource?: string;
  resources: LibraryResource[];
}) {
  const ar = locale === "ar";
  const selectedResource = resources.find((item) => item.slug === requestedResource) ?? resources[0] ?? null;
  const selectedVersion = selectedResource?.versions.find((item) => item.version === selectedResource.currentVersion) ?? selectedResource?.versions[0] ?? null;
  const sourceReferences = references(selectedVersion?.references);
  const stages = resourceStages(selectedVersion?.content);
  const selectedEngagement = engagements.find((item) => item.resourceId === selectedResource?.id);
  const liveAttachment = selectedResource?.attachments.find((attachment) => attachment.externalUrl && (attachment.mimeType?.startsWith("video/") || attachment.sourceName?.toLowerCase().includes("stream")));
  const activeRoot =
    definition.route.includes("/course/") ||
    definition.route.startsWith("/academy/certificates")
      ? "/academy/courses"
      : definition.route;
  const courseMode = definition.kind === "player" ? "lesson" : definition.kind === "form" ? "quiz" : definition.kind === "dashboard" ? "result" : definition.kind === "report" ? "certificate" : "detail";
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
        <AcademyCourseJourney course={course} locale={locale} mode={courseMode} />
      ) : selectedResource && definition.kind === "list" ? (
        <div className="academy-resource-catalog">
          <form className="academy-library__search" method="get">
            <input name="query" defaultValue="" placeholder={ar ? "بحث في العنوان أو المؤلف أو المصدر" : "Search title, author, or source"} />
            <input name="category" defaultValue="" placeholder={ar ? "التصنيف" : "Category"} />
            <button className="button button--secondary" type="submit">{ar ? "بحث" : "Search"}</button>
          </form>
          <div className="academy-resource-catalog__grid">{resources.map((resource) => {
            const engagement = engagements.find((item) => item.resourceId === resource.id);
            return <article key={resource.id}><header><span>{resource.category ?? resource.kind}</span><strong>{resource.approvalState}</strong></header><h2>{resource.title}</h2><p>{resource.summary ?? (ar ? "لا يوجد ملخص منشور." : "No published summary.")}</p><dl><div><dt>{ar ? "المؤلف" : "Author"}</dt><dd>{resource.authorName ?? (ar ? "غير متاح" : "Unavailable")}</dd></div><div><dt>{ar ? "المصدر" : "Source"}</dt><dd>{resource.sourceName ?? (ar ? "غير متاح" : "Unavailable")}</dd></div></dl>{engagement ? <small>{engagement.status.replaceAll("_", " ")}{engagement.progressPercent ? ` · ${engagement.progressPercent}%` : ""}</small> : null}<Link className="button button--primary" href={`${detailRoutes[resource.kind]}?resource=${resource.slug}`}>{ar ? "فتح" : "Open"}</Link></article>;
          })}</div>
        </div>
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
              <AcademyResourceActions initialProgress={selectedEngagement?.progressPercent} initialStatus={selectedEngagement?.status} kind={selectedResource.kind} locale={locale} resourceId={selectedResource.id} />
              <section className="academy-library__metadata"><div><span>{ar ? "المؤلف" : "Author"}</span><strong>{selectedVersion?.authorName ?? selectedResource.authorName ?? (ar ? "غير متاح" : "Unavailable")}</strong></div><div><span>{ar ? "المصدر" : "Source"}</span><strong>{selectedVersion?.sourceName ?? selectedResource.sourceName ?? (ar ? "غير متاح" : "Unavailable")}</strong></div><div><span>{ar ? "تاريخ المصدر" : "Source date"}</span><strong>{selectedVersion?.sourcePublishedAt ? new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "medium" }).format(selectedVersion.sourcePublishedAt) : ar ? "غير متاح" : "Unavailable"}</strong></div><div><span>{ar ? "الإصدار" : "Version"}</span><strong>v{selectedResource.currentVersion}</strong></div></section>
              {definition.kind === "live" ? <section className="academy-live-room"><h3>{ar ? "غرفة البث" : "Live room"}</h3>{liveAttachment?.externalUrl ? <a className="button button--primary" href={liveAttachment.externalUrl} rel="noreferrer" target="_blank">{ar ? "فتح البث المعتمد" : "Open approved stream"}</a> : <div className="academy-course-journey__state"><strong>{ar ? "البث غير متصل" : "Stream not connected"}</strong><p>{ar ? "تم اعتماد محتوى الندوة، لكن لا يوجد رابط بث صالح من مزود معتمد." : "The webinar content is approved, but no valid stream URL is connected from an approved provider."}</p></div>}</section> : null}
              {definition.kind === "timeline" ? <section className="academy-path-timeline"><h3>{ar ? "مراحل المسار" : "Path stages"}</h3>{stages.length ? stages.map((stage, index) => <article key={`${stage.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{stage.title}</strong><p>{stage.description ?? (ar ? "مرحلة موثقة ضمن المسار." : "A documented stage in this path.")}</p></div></article>) : <p>{ar ? "لا توجد مراحل منظّمة في الإصدار المعتمد." : "No structured stages are present in the approved version."}</p>}</section> : null}
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
