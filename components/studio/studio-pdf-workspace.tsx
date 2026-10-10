"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

import { Icon } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

const pdfTools = [
  ["merge", "دمج PDF", "Merge PDF", true],
  ["split", "تقسيم PDF", "Split PDF", true],
  ["extract", "استخراج الصفحات", "Extract pages", true],
  ["delete", "حذف الصفحات", "Delete pages", true],
  ["reorder", "إعادة الترتيب", "Reorder pages", true],
  ["rotate", "تدوير الصفحات", "Rotate pages", true],
  ["compress", "تحسين حجم PDF", "Optimize PDF", true],
  ["convert", "الصور إلى PDF", "Images to PDF", true],
  ["watermark", "العلامة المائية", "Watermark", true],
  ["numbers", "أرقام الصفحات", "Page numbers", true],
  ["redaction", "تنقيح المحتوى", "Redaction", true],
] as const;

type AdvancedPdfAction = "compress" | "convert" | "delete" | "extract" | "numbers" | "redaction" | "reorder" | "rotate" | "watermark";

const advancedPdfActions: readonly AdvancedPdfAction[] = ["compress", "convert", "delete", "extract", "numbers", "redaction", "reorder", "rotate", "watermark"];

function formatFileSize(bytes: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-GB", { maximumFractionDigits: 1 }).format(bytes / 1_048_576) + " MB";
}

function usePreviewUrl(file: File | null) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const nextUrl = file ? URL.createObjectURL(file) : "";
    const update = requestAnimationFrame(() => setUrl(nextUrl));
    return () => {
      cancelAnimationFrame(update);
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  return url;
}

export function StudioPdfWorkspace({
  editor,
  editorHref = "/studio/pdf/editor",
  initialTool,
  locale,
}: {
  editor: boolean;
  editorHref?: string;
  initialTool?: string;
  locale: Locale;
}) {
  const ar = locale === "ar";
  const [pdfs, setPdfs] = useState<File[]>([]);
  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [ranges, setRanges] = useState("");
  const [advancedAction, setAdvancedAction] = useState<AdvancedPdfAction>("extract");
  const [advancedFiles, setAdvancedFiles] = useState<File[]>([]);
  const [advancedPages, setAdvancedPages] = useState("");
  const [rotation, setRotation] = useState("90");
  const [watermark, setWatermark] = useState("");
  const [redaction, setRedaction] = useState({ page: "1", x: "0", y: "0", width: "100", height: "50" });
  const [requestedTool, setRequestedTool] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const previewFile = advancedAction !== "convert" && advancedFiles[0] ? advancedFiles[0] : splitFile ?? pdfs[0] ?? null;
  const previewUrl = usePreviewUrl(previewFile);
  const sourceFiles = pdfs.length > 1 ? pdfs : splitFile ? [splitFile] : advancedFiles;
  const pageOrder = advancedAction === "reorder" ? advancedPages.split(",").map((page) => page.trim()).filter(Boolean) : [];
  const activeTool = requestedTool ?? advancedAction;

  useEffect(() => {
    if (!editor) return;
    const tool = initialTool ?? new URLSearchParams(globalThis.location.search).get("tool");
    if (!tool || !pdfTools.some(([id]) => id === tool)) return;
    const update = requestAnimationFrame(() => {
      setRequestedTool(tool);
      if (advancedPdfActions.includes(tool as AdvancedPdfAction)) setAdvancedAction(tool as AdvancedPdfAction);
      globalThis.document.querySelector<HTMLElement>(`[data-pdf-tool="${tool}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(update);
  }, [editor, initialTool]);

  function moveMergeFile(index: number, direction: -1 | 1) {
    setPdfs((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const ordered = [...current];
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      return ordered;
    });
  }

  async function merge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pdfs.length) return;
    setBusy("merge");
    setMessage("");
    const form = new FormData();
    form.set("action", "mergePdf");
    pdfs.forEach((file) => form.append("files", file));
    const response = await fetch("/api/software/documents", { method: "POST", body: form });
    if (response.ok) {
      const url = URL.createObjectURL(await response.blob());
      const download = document.createElement("a");
      download.href = url;
      download.download = "jenan-merged.pdf";
      download.click();
      URL.revokeObjectURL(url);
      setMessage(ar ? "تم إنشاء الملف وتنزيله. سُجلت العملية دون حفظ محتوى الملف." : "The file was created and downloaded. The action was logged without storing its contents.");
    } else {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      setMessage(payload?.message ?? (ar ? "تعذر دمج الملفات." : "The files could not be merged."));
    }
    setBusy(null);
  }

  async function split(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!splitFile) return;
    setBusy("split");
    setMessage("");
    const form = new FormData();
    form.set("action", "splitPdf");
    form.set("ranges", ranges);
    form.append("files", splitFile);
    const response = await fetch("/api/software/documents", { method: "POST", body: form });
    const payload = await response.json().catch(() => null) as { documents?: string[]; message?: string } | null;
    if (response.ok && payload?.documents?.length) {
      payload.documents.forEach((encoded, index) => {
        const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const download = document.createElement("a");
        download.href = url;
        download.download = `jenan-split-${index + 1}.pdf`;
        download.click();
        URL.revokeObjectURL(url);
      });
      setMessage(ar ? `تم إنشاء وتنزيل ${payload.documents.length} ملفات.` : `${payload.documents.length} files were created and downloaded.`);
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر تقسيم الملف." : "The file could not be split."));
    }
    setBusy(null);
  }

  async function processAdvanced(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!advancedFiles.length) return;
    setBusy(advancedAction); setMessage("");
    const actionMap: Record<AdvancedPdfAction, string> = { compress: "compressPdf", convert: "imagesToPdf", delete: "deletePdfPages", extract: "extractPdf", numbers: "numberPdfPages", redaction: "redactPdf", reorder: "reorderPdfPages", rotate: "rotatePdfPages", watermark: "watermarkPdf" };
    const form = new FormData();
    form.set("action", actionMap[advancedAction]);
    advancedFiles.forEach((file) => form.append("files", file));
    if (["delete", "extract", "reorder", "rotate"].includes(advancedAction) && advancedPages.trim()) form.set("pages", advancedPages);
    if (advancedAction === "rotate") form.set("rotation", rotation);
    if (advancedAction === "watermark") form.set("text", watermark);
    if (advancedAction === "redaction") Object.entries(redaction).forEach(([key, value]) => form.set(key, value));
    const response = await fetch("/api/software/documents", { method: "POST", body: form });
    if (response.ok) {
      const url = URL.createObjectURL(await response.blob());
      const download = document.createElement("a");
      download.href = url;
      download.download = `jenan-${advancedAction}.pdf`;
      download.click();
      URL.revokeObjectURL(url);
      setMessage(ar ? "تم إنشاء الملف وتنزيله دون حفظ محتواه." : "The file was generated and downloaded without retaining its contents.");
    } else {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      setMessage(payload?.message ?? (ar ? "تعذرت معالجة الملف." : "The file could not be processed."));
    }
    setBusy(null);
  }

  if (!editor) {
    return (
      <section className="studio-pdf-catalog" aria-label={ar ? "أدوات Jenan PDF" : "Jenan PDF tools"}>
        <div className="studio-pdf-catalog__signals" aria-label={ar ? "حالة الأدوات الأساسية" : "Core tool status"}>
          {pdfTools.slice(0, 4).map(([id, arabic, english]) => (
            <article key={id}>
              <Icon name="check" />
              <strong>{ar ? "متاح" : "Ready"}</strong>
              <span>{ar ? arabic : english}</span>
              <small>{ar ? "معالجة خاصة دون حفظ المحتوى" : "Private processing without content retention"}</small>
            </article>
          ))}
        </div>

        <div className="studio-pdf-catalog__layout">
          <section className="studio-tool-picker">
            <header><div><span>JENAN PDF</span><h2>{ar ? "مكونات مساحة PDF" : "PDF workspace tools"}</h2></div><span className="studio-format-badge">11 {ar ? "أداة" : "TOOLS"}</span></header>
            <p>{ar ? "اختر العملية ثم نفّذها داخل المحرر. لا يُحفظ محتوى الملفات في سجل المنصة." : "Choose an operation, then run it in the editor. File contents are never retained in platform history."}</p>
            <div className="studio-tool-picker__grid">
              {pdfTools.map(([id, arabic, english, supported]) => supported ? (
                <Link href={`${editorHref}?tool=${id}`} className="studio-tool-card" key={id}>
                  <Icon name="activity" /><strong>{ar ? arabic : english}</strong><small>{ar ? "متاح الآن" : "Available now"}</small><Icon name="arrow" />
                </Link>
              ) : (
                <button className="studio-tool-card is-disabled" disabled key={id} type="button">
                  <Icon name="lock" /><strong>{ar ? arabic : english}</strong><small>{ar ? "غير متاح حالياً" : "Not currently available"}</small>
                </button>
              ))}
            </div>
          </section>

          <aside className="studio-pdf-catalog__aside">
            <section>
              <header><span>OUTPUT</span><h2>{ar ? "المخرج" : "Output"}</h2></header>
              <div className="studio-pdf-output"><Icon name="briefcase" /><div><strong>PDF</strong><small>{ar ? "ملف مستقل للتنزيل" : "Independent downloadable file"}</small></div></div>
            </section>
            <section>
              <header><span>STATUS</span><h2>{ar ? "الحالة السريعة" : "Quick status"}</h2></header>
              <ul>
                {pdfTools.slice(0, 4).map(([id, arabic, english]) => <li key={id}><span>{ar ? arabic : english}</span><strong><Icon name="check" />{ar ? "جاهز" : "Ready"}</strong></li>)}
              </ul>
            </section>
            <section className="studio-pdf-catalog__action">
              <header><span>ACTION</span><h2>{ar ? "ابدأ المعالجة" : "Start processing"}</h2></header>
              <p>{ar ? "جميع العمليات متاحة من مساحة تنفيذ موحدة وآمنة." : "All operations are available in one secure execution workspace."}</p>
              <Link className="button button--primary" href={editorHref}><Icon name="arrow" />{ar ? "اختيار أداة" : "Choose a tool"}</Link>
            </section>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="studio-pdf-editor">
      <div className="studio-pdf-editor__notice"><Icon name="shield" /><div><strong>{ar ? "معالجة خاصة" : "Private processing"}</strong><p>{ar ? "حتى 8 ملفات و10 ميغابايت لكل ملف. لا يُحفظ محتوى PDF في سجل المنصة." : "Up to 8 files and 10 MB per file. PDF contents are not retained in platform history."}</p></div></div>
      <section className="studio-pdf-preview" aria-label={ar ? "معاينة وترتيب PDF" : "PDF preview and ordering"}>
        <aside className="studio-pdf-preview__pages">
          <header><span>PAGES</span><h2>{ar ? "الملفات والصفحات" : "Files and pages"}</h2></header>
          {sourceFiles.length ? <ol>{sourceFiles.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><div><strong>{index + 1}</strong><span title={file.name}>{file.name}</span><small>{formatFileSize(file.size, locale)}</small></div>{pdfs.length > 1 ? <span><button aria-label={ar ? `تحريك ${file.name} لأعلى` : `Move ${file.name} up`} disabled={index === 0} onClick={() => moveMergeFile(index, -1)} title={ar ? "لأعلى" : "Move up"} type="button">↑</button><button aria-label={ar ? `تحريك ${file.name} لأسفل` : `Move ${file.name} down`} disabled={index === pdfs.length - 1} onClick={() => moveMergeFile(index, 1)} title={ar ? "لأسفل" : "Move down"} type="button">↓</button></span> : null}</li>)}</ol> : <div className="studio-pdf-preview__empty"><Icon name="briefcase" /><p>{ar ? "اختر ملفًا من إحدى الأدوات لعرضه هنا قبل التنفيذ." : "Choose a file in any tool to preview it here before processing."}</p></div>}
        </aside>
        <div className="studio-pdf-preview__stage">
          <header><div><span>PREVIEW</span><h2>{ar ? "معاينة محلية" : "Local preview"}</h2></div>{previewFile ? <small>{previewFile.name}</small> : null}</header>
          {previewUrl ? <object aria-label={ar ? `معاينة ${previewFile?.name}` : `Preview ${previewFile?.name}`} data={`${previewUrl}#toolbar=0&navpanes=0`} type="application/pdf"><p>{ar ? "المتصفح لا يدعم معاينة PDF المضمنة. يمكنك متابعة المعالجة والتنزيل." : "This browser cannot embed the PDF preview. You can still process and download it."}</p></object> : <div className="studio-pdf-preview__canvas"><Icon name="grid" /><strong>{ar ? "المعاينة جاهزة" : "Preview ready"}</strong><span>{ar ? "لن يغادر الملف هذه الجلسة إلا عند تنفيذ العملية على الخادم." : "The file stays in this session until you run a server operation."}</span></div>}
        </div>
        <aside className="studio-pdf-preview__plan">
          <header><span>ORDER</span><h2>{ar ? "خطة العملية" : "Operation plan"}</h2></header>
          <div><span>{ar ? "الأداة" : "Tool"}</span><strong>{ar ? pdfTools.find(([id]) => id === activeTool)?.[1] : pdfTools.find(([id]) => id === activeTool)?.[2]}</strong></div>
          <div><span>{ar ? "المصدر" : "Source"}</span><strong>{sourceFiles.length ? (ar ? `${sourceFiles.length} ملف` : `${sourceFiles.length} file${sourceFiles.length === 1 ? "" : "s"}`) : "—"}</strong></div>
          <div><span>{ar ? "الحالة" : "Status"}</span><strong className={busy ? "is-processing" : "is-ready"}>{busy ? (ar ? "جارٍ التنفيذ" : "Processing") : (ar ? "جاهز" : "Ready")}</strong></div>
          {pageOrder.length ? <div className="studio-pdf-preview__order"><span>{ar ? "ترتيب الصفحات" : "Page order"}</span><p>{pageOrder.map((page, index) => <span key={`${page}-${index}`}>{page}</span>)}</p></div> : null}
          <small>{ar ? "المعاينة من المتصفح. الناتج النهائي يُنشأ فقط عند الضغط على تنفيذ." : "Preview is browser-local. Final output is created only when you run the operation."}</small>
        </aside>
      </section>
      <div className="studio-pdf-editor__grid">
        <form className={activeTool === "merge" ? "is-targeted" : undefined} data-pdf-tool="merge" onSubmit={merge}>
          <span className="studio-format-badge">PDF + PDF</span>
          <h2>{ar ? "دمج الملفات" : "Merge files"}</h2>
          <p>{ar ? "يُحافظ ترتيب الاختيار على ترتيب الصفحات في الناتج." : "Selection order determines the page order in the output."}</p>
          <label className="studio-file-field"><input accept="application/pdf,.pdf" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { setPdfs(Array.from(event.target.files ?? [])); setRequestedTool("merge"); }} type="file" /><span>{pdfs.length ? (ar ? `${pdfs.length} ملفات محددة` : `${pdfs.length} files selected`) : (ar ? "اختر ملفات PDF" : "Choose PDF files")}</span></label>
          <button className="button button--primary" disabled={!pdfs.length || busy !== null} type="submit"><Icon name="check" />{busy === "merge" ? (ar ? "جارٍ الدمج..." : "Merging...") : (ar ? "دمج وتنزيل" : "Merge and download")}</button>
        </form>
        <form className={activeTool === "split" ? "is-targeted" : undefined} data-pdf-tool="split" onSubmit={split}>
          <span className="studio-format-badge">PDF → PDF</span>
          <h2>{ar ? "تقسيم الملف" : "Split a file"}</h2>
          <p>{ar ? "اكتب نطاقات مثل 1-2, 3, 5-7 أو اتركها فارغة لكل صفحة." : "Enter ranges such as 1-2, 3, 5-7, or leave blank for every page."}</p>
          <label className="studio-file-field"><input accept="application/pdf,.pdf" onChange={(event) => { setSplitFile(event.target.files?.[0] ?? null); setRequestedTool("split"); }} type="file" /><span>{splitFile?.name ?? (ar ? "اختر ملف PDF" : "Choose a PDF file")}</span></label>
          <input aria-label={ar ? "نطاقات الصفحات" : "Page ranges"} onChange={(event) => setRanges(event.target.value)} placeholder="1-2, 3, 5-7" value={ranges} />
          <button className="button button--primary" disabled={!splitFile || busy !== null} type="submit"><Icon name="check" />{busy === "split" ? (ar ? "جارٍ التقسيم..." : "Splitting...") : (ar ? "تقسيم وتنزيل" : "Split and download")}</button>
        </form>
        <form className={`studio-pdf-advanced${advancedPdfActions.includes(activeTool as AdvancedPdfAction) ? " is-targeted" : ""}`} data-pdf-tool={advancedAction} onSubmit={processAdvanced}>
          <span className="studio-format-badge">PDF LAB</span>
          <h2>{ar ? "عمليات الصفحات والإخراج" : "Page and output operations"}</h2>
          <select aria-label={ar ? "عملية PDF" : "PDF operation"} value={advancedAction} onChange={(event) => { const action = event.target.value as AdvancedPdfAction; setAdvancedAction(action); setRequestedTool(action); setAdvancedFiles([]); }}><option value="extract">{ar ? "استخراج صفحات" : "Extract pages"}</option><option value="delete">{ar ? "حذف صفحات" : "Delete pages"}</option><option value="reorder">{ar ? "إعادة ترتيب" : "Reorder pages"}</option><option value="rotate">{ar ? "تدوير" : "Rotate"}</option><option value="compress">{ar ? "تحسين الحجم" : "Optimize size"}</option><option value="convert">{ar ? "صور إلى PDF" : "Images to PDF"}</option><option value="watermark">{ar ? "علامة مائية" : "Watermark"}</option><option value="numbers">{ar ? "ترقيم الصفحات" : "Page numbers"}</option><option value="redaction">{ar ? "تنقيح آمن" : "Secure redaction"}</option></select>
          <label className="studio-file-field"><input accept={advancedAction === "convert" ? "image/png,image/jpeg" : "application/pdf,.pdf"} multiple={advancedAction === "convert"} onChange={(event) => setAdvancedFiles(Array.from(event.target.files ?? []))} type="file" /><span>{advancedFiles.length ? (ar ? `${advancedFiles.length} ملفات محددة` : `${advancedFiles.length} files selected`) : advancedAction === "convert" ? (ar ? "اختر صور PNG/JPEG" : "Choose PNG/JPEG images") : (ar ? "اختر ملف PDF" : "Choose a PDF file")}</span></label>
          {["delete", "extract", "reorder", "rotate"].includes(advancedAction) ? <input aria-label={ar ? "أرقام الصفحات" : "Page numbers"} required={advancedAction !== "rotate"} value={advancedPages} onChange={(event) => setAdvancedPages(event.target.value)} placeholder={advancedAction === "reorder" ? "3,1,2,4" : "1,3,5"} /> : null}
          {advancedAction === "rotate" ? <select aria-label={ar ? "زاوية الدوران" : "Rotation angle"} value={rotation} onChange={(event) => setRotation(event.target.value)}><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select> : null}
          {advancedAction === "watermark" ? <input aria-label={ar ? "نص العلامة" : "Watermark text"} required minLength={1} maxLength={120} value={watermark} onChange={(event) => setWatermark(event.target.value)} placeholder={ar ? "سري" : "CONFIDENTIAL"} /> : null}
          {advancedAction === "redaction" ? <fieldset className="studio-redaction-fields"><legend>{ar ? "المستطيل بوحدة نقاط PDF" : "Rectangle in PDF points"}</legend>{(["page", "x", "y", "width", "height"] as const).map((field) => <label key={field}><span>{field}</span><input aria-label={`Redaction ${field}`} min={field === "page" || field === "width" || field === "height" ? "1" : "0"} required step="1" type="number" value={redaction[field]} onChange={(event) => setRedaction({ ...redaction, [field]: event.target.value })} /></label>)}</fieldset> : null}
          <button className="button button--primary" disabled={!advancedFiles.length || busy !== null} type="submit"><Icon name="check" />{busy === advancedAction ? (ar ? "جارٍ التنفيذ..." : "Processing...") : (ar ? "تنفيذ وتنزيل" : "Process and download")}</button>
          <small>{advancedAction === "compress" ? (ar ? "يعيد بناء بنية PDF ويُبقي النسخة الأصغر فقط." : "Rebuilds the PDF structure and retains the smaller representation.") : advancedAction === "redaction" ? (ar ? "يعيد تصيير الصفحة المتأثرة ثم يحذف محتواها الأصلي نهائياً؛ تصبح الصفحة صورة غير قابلة للبحث." : "Re-renders the affected page and permanently discards its original content; that page becomes non-searchable.") : (ar ? "المعالجة محلية على الخادم ولا يُحفظ المحتوى." : "Server-side processing does not retain file content.")}</small>
        </form>
      </div>
      {message ? <p className="studio-message" role="status">{message}</p> : null}
    </section>
  );
}