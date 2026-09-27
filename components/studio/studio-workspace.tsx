"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StudioDocumentEditor } from "@/components/studio/studio-document-editor";
import { StudioPdfWorkspace } from "@/components/studio/studio-pdf-workspace";
import { Icon } from "@/components/ui/icons";
import { STUDIO_FLOW_ROUTES, type StudioFlowRoute } from "@/lib/studio/studio-routes";
import type { Locale } from "@/types/i18n";
import { createBlankStudioContent, STUDIO_KIND_ROUTES, STUDIO_ROUTE_KINDS, type StudioActivity, type StudioDocumentKind, type StudioDocumentRecord } from "./studio-types";

type StudioRouteId = StudioFlowRoute["id"];

const routeCopy: Record<StudioRouteId, { title: [string, string]; description: [string, string]; eyebrow: string }> = {
  dashboard: { title: ["برمجيات وأدوات Jenan PRO", "Jenan PRO tools"], description: ["محررات عملية، معالجة ملفات آمنة، وسجل إصدارات حقيقي في مساحة واحدة.", "Practical editors, private file processing, and real version history in one workspace."], eyebrow: "TOOLS 078" },
  pdf: { title: ["Jenan PDF", "Jenan PDF"], description: ["ادمج أو قسّم ملفات PDF داخل الجلسة دون الاحتفاظ بمحتواها.", "Merge or split PDF files in-session without retaining their contents."], eyebrow: "PDF 079" },
  "pdf-editor": { title: ["محرر PDF", "PDF editor"], description: ["مساحة تنفيذ واضحة للدمج والتقسيم والتنزيل.", "A focused workspace for merge, split, and download operations."], eyebrow: "PDF 080" },
  docs: { title: ["Jenan Docs", "Jenan Docs"], description: ["اكتب المستندات، استورد النص من DOCX، واحفظ كل إصدار.", "Write documents, import text from DOCX, and preserve every version."], eyebrow: "DOCS 081" },
  sheets: { title: ["Jenan Sheets", "Jenan Sheets"], description: ["حرر جداول خفيفة، اقرأ XLSX، وصدّر البيانات إلى CSV.", "Edit lightweight tables, inspect XLSX, and export data to CSV."], eyebrow: "SHEETS 082" },
  presentations: { title: ["Jenan Presentations", "Jenan Presentations"], description: ["أنشئ شرائح قابلة للحفظ والطباعة دون ادعاء تصدير PPTX غير مدعوم.", "Build versioned, printable slides without claiming unsupported PPTX export."], eyebrow: "SLIDES 083" },
  logo: { title: ["مصمم الشعار والهوية", "Logo and brand designer"], description: ["كوّن علامة هندسية بسيطة واحفظ نسخ الهوية ونزّل PNG.", "Compose a simple geometric mark, save versions, and download PNG."], eyebrow: "BRAND 084" },
  letterhead: { title: ["تصميم الورق الرسمي", "Letterhead designer"], description: ["رتّب ترويسة وتذييل الشركة ثم اطبعها أو احفظها PDF من المتصفح.", "Compose a company header and footer, then print or save as PDF from the browser."], eyebrow: "PAPER 085" },
  cv: { title: ["منشئ السيرة الذاتية", "CV builder"], description: ["أنشئ سيرة مهنية واضحة مع معاينة وطباعة وإصدارات محفوظة.", "Build a clear professional CV with preview, print, and saved versions."], eyebrow: "CV 086" },
  history: { title: ["سجل الملفات والإصدارات", "File and version history"], description: ["راجع المشاريع المحفوظة وعمليات المعالجة واستعد إصداراً سابقاً كنسخة جديدة.", "Review saved projects and processing actions, then restore an earlier version as a new one."], eyebrow: "HISTORY 087" },
};

const toolCards = [
  ["pdf", "/studio/pdf", "PDF", "دمج وتقسيم خاص", "Private merge and split", "activity"],
  ["docs", "/studio/docs", "Docs", "مستندات وإصدارات", "Documents and versions", "briefcase"],
  ["sheets", "/studio/sheets", "Sheets", "جداول وCSV", "Tables and CSV", "grid"],
  ["presentations", "/studio/presentations", "Presentations", "شرائح قابلة للطباعة", "Printable slides", "pieChart"],
  ["logo", "/studio/logo", "Logo & Brand", "هوية قابلة للتنزيل", "Downloadable identity", "sparkles"],
  ["letterhead", "/studio/letterhead", "Letterhead", "ورق رسمي", "Official stationery", "mail"],
  ["cv", "/studio/cv", "CV Builder", "سيرة مهنية", "Professional CV", "user"],
] as const;

function pick(copy: readonly [string, string], locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function StudioWorkspace({ initialDocumentId, locale, routeId }: { initialDocumentId?: string; locale: Locale; routeId: StudioRouteId }) {
  const ar = locale === "ar";
  const kind = STUDIO_ROUTE_KINDS[routeId];
  const [documents, setDocuments] = useState<StudioDocumentRecord[]>([]);
  const [activity, setActivity] = useState<StudioActivity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<Record<string, unknown>>(kind ? createBlankStudioContent(kind) : {});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const copy = routeCopy[routeId];

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const response = await fetch("/api/studio/documents", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { documents?: StudioDocumentRecord[]; activity?: StudioActivity[]; message?: string } | null;
      if (!active) return;
      if (response.ok && payload?.documents) {
        setDocuments(payload.documents);
        setActivity(payload.activity ?? []);
        if (kind) {
          const document = payload.documents.find((item) => item.id === initialDocumentId && item.kind === kind) ?? payload.documents.find((item) => item.kind === kind);
          if (document) openDocument(document);
        }
      } else {
        setMessage(payload?.message ?? (ar ? "تعذر تحميل مساحة Studio." : "Studio could not be loaded."));
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [ar, initialDocumentId, kind]);

  function openDocument(document: StudioDocumentRecord) {
    setSelectedId(document.id);
    setTitle(document.title);
    setContent(document.content);
    setMessage("");
  }

  function newDocument(documentKind: StudioDocumentKind) {
    setSelectedId(null);
    setTitle("");
    setContent(createBlankStudioContent(documentKind));
    setMessage("");
  }

  async function saveDocument() {
    if (!kind || title.trim().length < 2) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/studio/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(selectedId ? { action: "update", documentId: selectedId, kind, title, content } : { action: "create", kind, title, content }),
    });
    const payload = await response.json().catch(() => null) as { document?: StudioDocumentRecord; message?: string } | null;
    if (response.ok && payload?.document) {
      const document = payload.document;
      setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
      openDocument(document);
      setMessage(ar ? `حُفظ الإصدار ${document.currentVersion}.` : `Version ${document.currentVersion} saved.`);
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر حفظ المشروع." : "The project could not be saved."));
    }
    setBusy(false);
  }

  async function restore(documentId: string, version: number) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/studio/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "restore", documentId, version }),
    });
    const payload = await response.json().catch(() => null) as { document?: StudioDocumentRecord; message?: string } | null;
    if (response.ok && payload?.document) {
      setDocuments((current) => [payload.document!, ...current.filter((item) => item.id !== documentId)]);
      setMessage(ar ? `استُعيد الإصدار ${version} كإصدار ${payload.document.currentVersion}.` : `Version ${version} restored as version ${payload.document.currentVersion}.`);
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر استعادة الإصدار." : "The version could not be restored."));
    }
    setBusy(false);
  }

  const selected = documents.find((document) => document.id === selectedId);
  const documentsForKind = kind ? documents.filter((document) => document.kind === kind) : [];
  const versionCount = documents.reduce((total, document) => total + document.versions.length, 0);

  return (
    <section className="studio-flow">
      <nav className="studio-flow__nav" aria-label={ar ? "مسارات الأدوات" : "Tools routes"}>
        {STUDIO_FLOW_ROUTES.map((route, index) => <Link aria-current={route.id === routeId ? "page" : undefined} className={route.id === routeId ? "is-active" : ""} href={route.href} key={route.id}><span>{String(index + 1).padStart(2, "0")}</span>{pick(route.label, locale)}</Link>)}
      </nav>

      <header className="studio-flow__header">
        <div><span>{copy.eyebrow}</span><h1>{pick(copy.title, locale)}</h1><p>{pick(copy.description, locale)}</p></div>
        <div className="studio-flow__pulse"><Icon name="sparkles" /><span>{ar ? "مساحة آمنة" : "Secure workspace"}</span><small>{ar ? "حفظ بإذن المستخدم" : "User-directed saves"}</small></div>
      </header>

      {loading ? <div className="studio-flow__loading"><span />{ar ? "جارٍ تحميل مشاريعك..." : "Loading your projects..."}</div> : null}

      {!loading && routeId === "dashboard" ? <>
        <section className="studio-flow__signals">
          <article><Icon name="briefcase" /><strong>{documents.length}</strong><span>{ar ? "مشاريع محفوظة" : "Saved projects"}</span></article>
          <article><Icon name="activity" /><strong>{versionCount}</strong><span>{ar ? "إصدارات متاحة" : "Available versions"}</span></article>
          <article><Icon name="shield" /><strong>{activity.filter((entry) => entry.action.startsWith("software.documents.")).length}</strong><span>{ar ? "عمليات ملفات مسجّلة" : "Logged file actions"}</span></article>
        </section>
        <section className="studio-dashboard-grid">{toolCards.map(([id, href, label, arabic, english, icon]) => <Link href={href} key={id}><span><Icon name={icon} /></span><div><small>JENAN PRO</small><h2>{label}</h2><p>{ar ? arabic : english}</p></div><Icon name="arrow" /></Link>)}</section>
        <section className="studio-recent"><header><div><span>RECENT</span><h2>{ar ? "آخر المشاريع" : "Recent projects"}</h2></div><Link href="/studio/history">{ar ? "فتح السجل" : "Open history"}<Icon name="arrow" /></Link></header>{documents.length ? <div>{documents.slice(0, 5).map((document) => <Link href={`${STUDIO_KIND_ROUTES[document.kind]}?document=${document.id}`} key={document.id}><span>{document.kind}</span><strong>{document.title}</strong><small>v{document.currentVersion} · {formatDate(document.updatedAt, locale)}</small></Link>)}</div> : <p>{ar ? "لا توجد مشاريع محفوظة بعد. افتح أداة وابدأ أول مشروع." : "No saved projects yet. Open a tool to start your first project."}</p>}</section>
      </> : null}

      {!loading && (routeId === "pdf" || routeId === "pdf-editor") ? <StudioPdfWorkspace editor={routeId === "pdf-editor"} locale={locale} /> : null}

      {!loading && kind ? <>
        <div className="studio-document-strip">
          <label>{ar ? "المشروع المفتوح" : "Open project"}<select onChange={(event) => { const document = documents.find((item) => item.id === event.target.value); if (document) openDocument(document); else newDocument(kind); }} value={selectedId ?? "new"}><option value="new">{ar ? "مشروع جديد" : "New project"}</option>{documentsForKind.map((document) => <option key={document.id} value={document.id}>{document.title} · v{document.currentVersion}</option>)}</select></label>
          <Link href="/studio/history"><Icon name="activity" />{ar ? "الإصدارات" : "Versions"}</Link>
        </div>
        <StudioDocumentEditor busy={busy} content={content} currentVersion={selected?.currentVersion} kind={kind} locale={locale} message={message} onChange={setContent} onNew={() => newDocument(kind)} onSave={saveDocument} onTitleChange={setTitle} title={title} />
      </> : null}

      {!loading && routeId === "history" ? <section className="studio-history">
        {message ? <p className="studio-message" role="status">{message}</p> : null}
        <div className="studio-history__documents"><header><span>FILES</span><h2>{ar ? "المشاريع والإصدارات" : "Projects and versions"}</h2></header>{documents.length ? documents.map((document) => <article key={document.id}><div><span>{document.kind}</span><h3>{document.title}</h3><p>v{document.currentVersion} · {formatDate(document.updatedAt, locale)}</p></div><Link href={`${STUDIO_KIND_ROUTES[document.kind]}?document=${document.id}`}>{ar ? "فتح" : "Open"}<Icon name="arrow" /></Link><details><summary>{ar ? `${document.versions.length} إصدارات` : `${document.versions.length} versions`}</summary><div>{document.versions.map((version) => <button disabled={busy || version.version === document.currentVersion} key={version.id} onClick={() => restore(document.id, version.version)} type="button"><span>v{version.version}</span><small>{formatDate(version.createdAt, locale)}</small><strong>{version.version === document.currentVersion ? (ar ? "الحالي" : "Current") : (ar ? "استعادة كإصدار جديد" : "Restore as new")}</strong></button>)}</div></details></article>) : <p>{ar ? "لا توجد مشاريع محفوظة." : "No saved projects."}</p>}</div>
        <aside className="studio-history__activity"><header><span>ACTIVITY</span><h2>{ar ? "عمليات المعالجة" : "Processing activity"}</h2></header>{activity.length ? activity.map((entry) => <article key={entry.id}><Icon name={entry.action.includes("restored") ? "activity" : "check"} /><div><strong>{entry.action.replace("software.documents.", "PDF / ").replace("studio.document.", "Document / ")}</strong><small>{formatDate(entry.createdAt, locale)}</small></div></article>) : <p>{ar ? "لا يوجد نشاط مسجّل." : "No recorded activity."}</p>}</aside>
      </section> : null}
    </section>
  );
}