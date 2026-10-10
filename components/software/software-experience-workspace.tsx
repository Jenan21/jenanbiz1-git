"use client";

import Link from "next/link";
import Image from "next/image";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

import { StudioPdfWorkspace } from "@/components/studio/studio-pdf-workspace";
import { Icon, type IconName } from "@/components/ui/icons";
import type { SoftwareExperienceRoute } from "@/lib/software/software-experience-routes";
import type { Locale } from "@/types/i18n";

type Activity = {
  action: string;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown> | null;
};

type StudioDocument = {
  currentVersion: number;
  id: string;
  kind: "CV" | "DOCS" | "LETTERHEAD" | "LOGO" | "PRESENTATION" | "SHEETS";
  title: string;
  updatedAt: string;
};

const fileTools: Array<{
  copy: [string, string];
  href: string;
  icon: IconName;
  label: [string, string];
  tone: string;
}> = [
  { href: "/software/files/images-to-pdf", icon: "pieChart", label: ["الصور إلى PDF", "Images to PDF"], copy: ["اجمع الصور في ملف PDF واحد", "Combine images into one PDF"], tone: "pink" },
  { href: "/software/files/merge-pdf", icon: "briefcase", label: ["دمج PDF", "Merge PDF"], copy: ["دمج عدة ملفات بترتيبك", "Merge ordered PDF files"], tone: "blue" },
  { href: "/software/files/split-pdf", icon: "grid", label: ["تقسيم PDF", "Split PDF"], copy: ["استخراج صفحات أو نطاقات", "Extract pages or ranges"], tone: "purple" },
  { href: "/software/files/compress-pdf", icon: "activity", label: ["ضغط PDF", "Optimize PDF"], copy: ["تقليل الحجم دون ادعاء نسبة ثابتة", "Reduce size when safely possible"], tone: "orange" },
  { href: "/software/files/pdf-to-word", icon: "briefcase", label: ["PDF إلى Word", "PDF to Word"], copy: ["استخراج النص إلى DOCX", "Extract text into DOCX"], tone: "red" },
  { href: "/software/files/word-to-pdf", icon: "briefcase", label: ["Word إلى PDF", "Word to PDF"], copy: ["تحويل النص إلى ملف PDF", "Render document text as PDF"], tone: "indigo" },
  { href: "/software/files/excel-to-pdf", icon: "barChart", label: ["Excel إلى PDF", "Excel to PDF"], copy: ["تحويل الجداول إلى PDF", "Render sheets as PDF"], tone: "green" },
  { href: "/software/files/pdf-to-excel", icon: "barChart", label: ["PDF إلى Excel", "PDF to Excel"], copy: ["استخراج النص إلى XLSX", "Extract text into XLSX"], tone: "emerald" },
];

const designTools: Array<{
  copy: [string, string];
  href: string;
  icon: IconName;
  label: [string, string];
}> = [
  { href: "/software/design/logo", icon: "sparkles", label: ["تصميم شعار", "Logo design"], copy: ["هوية قابلة للتنزيل", "Downloadable brand identity"] },
  { href: "/software/design/letterhead", icon: "mail", label: ["ورق رسمي", "Letterhead"], copy: ["ترويسة وتذييل احترافيان", "Professional header and footer"] },
  { href: "/software/design/cv", icon: "user", label: ["سيرة ذاتية", "CV builder"], copy: ["قوالب مهنية وإصدارات", "Professional templates and versions"] },
  { href: "/software/design/docs", icon: "briefcase", label: ["ملف شركة", "Company profile"], copy: ["مستند منظم قابل للتصدير", "Structured exportable document"] },
  { href: "/software/design/presentations", icon: "pieChart", label: ["عرض تقديمي", "Presentation"], copy: ["شرائح متعددة التخطيطات", "Multi-layout slide deck"] },
];

function pick(copy: readonly [string, string], locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const download = document.createElement("a");
  download.href = url;
  download.download = fileName;
  download.click();
  URL.revokeObjectURL(url);
}

function useSoftwareRecords() {
  const [activity, setActivity] = useState<Activity[]>([]);
  const [documents, setDocuments] = useState<StudioDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/studio/documents", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { activity?: Activity[]; documents?: StudioDocument[]; message?: string } | null;
    if (response.ok && payload) {
      setActivity(payload.activity ?? []);
      setDocuments(payload.documents ?? []);
      setLoadError("");
    } else {
      setLoadError(payload?.message ?? "Software records could not be loaded.");
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/studio/documents", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json().catch(() => null) as { activity?: Activity[]; documents?: StudioDocument[]; message?: string } | null;
      if (!active) return;
      if (response.ok && payload) {
        setActivity(payload.activity ?? []);
        setDocuments(payload.documents ?? []);
      } else {
        setLoadError(payload?.message ?? "Software records could not be loaded.");
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return { activity, documents, load, loadError, loading };
}

function Portal({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  return (
    <section className="software-portal" data-software-experience="portal" data-software-route="/software">
      <header className="software-portal__hero">
        <div className="software-portal__files-art" aria-hidden="true">
          <span>PDF</span><span>W</span><span>X</span><span>IMG</span>
        </div>
        <div>
          <span>{ar ? "مرحبًا بك في" : "Welcome to"}</span>
          <h1>{ar ? "برمجيات جنان" : "Jenan Software"}</h1>
          <p>{ar ? "مجموعة من الأدوات الذكية التي تجمع بين البساطة والقوة، لتنجز أعمالك بسرعة وجودة احترافية." : "A focused suite of smart tools that combines simplicity, speed, and professional output."}</p>
        </div>
        <div className="software-portal__design-art" aria-hidden="true">
          <Icon name="sparkles" /><span>JENAN</span><small>PRO</small>
        </div>
      </header>

      <div className="software-portal__choices">
        <article>
          <div className="software-portal__choice-copy">
            <span><Icon name="activity" />{ar ? "أدوات قوية وسريعة" : "Fast, capable tools"}</span>
            <h2>{ar ? "أدوات الملفات" : "File tools"}</h2>
            <h3>{ar ? "كل ما تحتاجه للتعامل مع ملفاتك في مكان واحد" : "Everything you need for document processing"}</h3>
            <p>{ar ? "تحويل ودمج وتقسيم وضغط ومعالجة ملفات PDF والصور وWord وExcel داخل جلسة آمنة." : "Convert, merge, split, optimize, and process PDF, image, Word, and Excel files in a private session."}</p>
            <div>{fileTools.slice(0, 5).map((tool) => <span key={tool.href}><Icon name={tool.icon} />{pick(tool.label, locale)}</span>)}</div>
            <Link href="/software/files">{ar ? "استعرض أدوات الملفات" : "Explore file tools"}<Icon name="arrow" /></Link>
          </div>
          <div className="software-portal__choice-art software-portal__choice-art--files" aria-hidden="true"><b>PDF</b><b>W</b><b>X</b></div>
        </article>
        <article>
          <div className="software-portal__choice-copy">
            <span><Icon name="sparkles" />{ar ? "تصاميم احترافية جاهزة" : "Professional designs"}</span>
            <h2>{ar ? "استوديو التصميم" : "Design studio"}</h2>
            <h3>{ar ? "تصاميم احترافية لهويتك ومشاريعك" : "Professional assets for your identity and projects"}</h3>
            <p>{ar ? "أنشئ شعارًا وورقًا رسميًا وسيرة ذاتية وملف شركة وعروضًا تقديمية بإصدارات محفوظة." : "Create logos, letterheads, CVs, company profiles, and presentations with saved versions."}</p>
            <div>{designTools.map((tool) => <span key={tool.href}><Icon name={tool.icon} />{pick(tool.label, locale)}</span>)}</div>
            <Link href="/software/design">{ar ? "استعرض استوديو التصميم" : "Explore design studio"}<Icon name="arrow" /></Link>
          </div>
          <div className="software-portal__choice-art software-portal__choice-art--design" aria-hidden="true"><Icon name="sparkles" /><b>Jenan PRO</b></div>
        </article>
      </div>

      <footer className="software-portal__benefits">
        <div><Icon name="activity" /><span><strong>{ar ? "سرعة في الإنجاز" : "Fast delivery"}</strong><small>{ar ? "معالجة محلية وخادم موثوق" : "Private processing and reliable services"}</small></span></div>
        <div><Icon name="dashboard" /><span><strong>{ar ? "بساطة وسهولة" : "Simple workflow"}</strong><small>{ar ? "واجهات واضحة ومتجاوبة" : "Clear responsive interfaces"}</small></span></div>
        <div><Icon name="sparkles" /><span><strong>{ar ? "نتائج احترافية" : "Professional output"}</strong><small>{ar ? "تنزيلات حقيقية وسجل واضح" : "Real downloads and auditable history"}</small></span></div>
      </footer>
    </section>
  );
}

function FileDashboard({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const inputRef = useRef<HTMLInputElement>(null);
  const { activity, load, loadError, loading } = useSoftwareRecords();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);

  async function processFiles(files: File[]) {
    if (!files.length || busy) return;
    const allImages = files.every((file) => ["image/jpeg", "image/png"].includes(file.type));
    const allPdfs = files.every((file) => file.type === "application/pdf");
    const action = allImages ? "imagesToPdf" : allPdfs ? (files.length > 1 ? "mergePdf" : "compressPdf") : files.length === 1 && files[0].name.toLocaleLowerCase().endsWith(".docx") ? "docxToPdf" : files.length === 1 && files[0].name.toLocaleLowerCase().endsWith(".xlsx") ? "xlsxToPdf" : null;
    if (!action) {
      setMessage(ar ? "اختر صور PNG/JPG، أو ملفات PDF، أو ملف DOCX/XLSX واحدًا." : "Choose PNG/JPG images, PDF files, or one DOCX/XLSX file.");
      return;
    }
    setBusy(true); setProgress(32); setMessage("");
    const form = new FormData();
    form.set("action", action);
    files.forEach((file) => form.append("files", file));
    setProgress(68);
    const response = await fetch("/api/software/documents", { method: "POST", body: form });
    if (response.ok) {
      const extension = action === "docxToPdf" || action === "xlsxToPdf" || action.endsWith("Pdf") ? "pdf" : "bin";
      triggerDownload(await response.blob(), `jenan-quick-output.${extension}`);
      setProgress(100);
      setMessage(ar ? "اكتملت المعالجة ونُزّل الملف. لم يُحفظ محتوى المصدر." : "Processing completed and the output was downloaded. Source content was not retained.");
      await load();
    } else {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      setProgress(0);
      setMessage(payload?.message ?? (ar ? "تعذرت معالجة الملف." : "The file could not be processed."));
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className="software-files" data-software-experience="files" data-software-route="/software/files">
      <header className="software-section-heading"><div><Icon name="briefcase" /><span><h1>{ar ? "أدوات الملفات" : "File tools"}</h1><p>{ar ? "كل ما تحتاجه للتعامل مع ملفاتك في مكان واحد" : "Everything you need for documents in one place"}</p></span></div><aside><b><Icon name="sparkles" />{ar ? "أدوات احترافية" : "Professional"}</b><b><Icon name="activity" />{ar ? "معالجة سريعة" : "Fast processing"}</b><b><Icon name="shield" />{ar ? "آمن وخاص" : "Private"}</b></aside></header>
      <section className="software-files__drop">
        <div aria-hidden="true"><Icon name="briefcase" /></div>
        <div><h2>{ar ? "ارفع ملفاتك وابدأ المعالجة الآن" : "Upload files and start processing"}</h2><p>{ar ? "تُحدد العملية تلقائيًا وفق نوع الملفات، ويمكنك اختيار أداة متخصصة من الأسفل." : "The quick action is selected by file type, or choose a dedicated tool below."}</p></div>
        <label><Icon name="plus" />{busy ? (ar ? "جارٍ التنفيذ..." : "Processing...") : (ar ? "اسحب الملفات هنا أو اضغط للاختيار" : "Drop files or choose from device")}<input ref={inputRef} accept=".pdf,.docx,.xlsx,image/jpeg,image/png" disabled={busy} multiple onChange={(event) => void processFiles(Array.from(event.target.files ?? []))} type="file" /></label>
        <small>PDF, DOCX, XLSX, PNG, JPG · {ar ? "حتى 8 ملفات و10MB للملف" : "Up to 8 files and 10 MB each"}</small>
        {progress ? <progress max="100" value={progress} /> : null}
        {message ? <p role="status">{message}</p> : null}
      </section>

      <section className="software-tool-catalog"><header><div><Icon name="grid" /><span><h2>{ar ? "أدوات الملفات" : "File tools"}</h2><p>{ar ? "اختر الأداة المناسبة لاحتياجك" : "Choose the right operation"}</p></span></div></header><div>{fileTools.map((tool) => <Link className={`software-tool-link software-tool-link--${tool.tone}`} href={tool.href} key={tool.href}><span><Icon name={tool.icon} /></span><h3>{pick(tool.label, locale)}</h3><p>{pick(tool.copy, locale)}</p><b><Icon name="arrow" /></b></Link>)}</div></section>

      <div className="software-files__lower">
        <section><header><Icon name="activity" /><h2>{ar ? "حالة المعالجة" : "Processing history"}</h2></header>{loading ? <p>{ar ? "جارٍ تحميل السجل..." : "Loading history..."}</p> : loadError ? <p>{loadError}</p> : activity.filter((entry) => entry.action.startsWith("software.documents.")).length ? activity.filter((entry) => entry.action.startsWith("software.documents.")).slice(0, 4).map((entry) => <article key={entry.id}><span><Icon name="check" /></span><div><strong>{entry.action.replace("software.documents.", "")}</strong><small>{formatDate(entry.createdAt, locale)}</small></div><b>100%</b></article>) : <p>{ar ? "لا توجد عمليات ملفات مسجلة بعد." : "No file operations have been recorded yet."}</p>}</section>
        <section><header><Icon name="activity" /><h2>{ar ? "إجراءات سريعة" : "Quick actions"}</h2></header><div className="software-quick-links"><button onClick={() => inputRef.current?.click()} type="button"><Icon name="briefcase" />{ar ? "اختيار ملفات" : "Choose files"}</button><Link href="/software/files/merge-pdf"><Icon name="plus" />{ar ? "دمج ملفات" : "Merge files"}</Link><Link href="/software/design/history"><Icon name="activity" />{ar ? "سجل الإصدارات" : "Version history"}</Link><Link href="/software/design"><Icon name="sparkles" />{ar ? "استوديو التصميم" : "Design studio"}</Link></div></section>
      </div>
    </section>
  );
}

function ImageToPdfWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pageSize, setPageSize] = useState("A4");
  const [orientation, setOrientation] = useState("auto");
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);

  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);

  function addFiles(nextFiles: File[]) {
    const accepted = nextFiles.filter((file) => ["image/jpeg", "image/png"].includes(file.type) && file.size <= 10 * 1024 * 1024);
    setFiles((current) => [...current, ...accepted].slice(0, 8));
    if (accepted.length !== nextFiles.length) setMessage(ar ? "تم تجاهل الصور غير المدعومة أو التي تتجاوز 10MB." : "Unsupported images or images over 10 MB were ignored.");
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  }

  function move(index: number, direction: -1 | 1) {
    setFiles((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const ordered = [...current];
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      return ordered;
    });
  }

  async function convert() {
    if (!files.length) return;
    setBusy(true); setMessage("");
    const form = new FormData();
    form.set("action", "imagesToPdf");
    form.set("pageSize", pageSize);
    form.set("orientation", orientation);
    files.forEach((file) => form.append("files", file));
    const response = await fetch("/api/software/documents", { method: "POST", body: form });
    if (response.ok) {
      triggerDownload(await response.blob(), "jenan-images.pdf");
      setMessage(ar ? "تم إنشاء ملف PDF وتنزيله دون حفظ الصور." : "The PDF was generated and downloaded without storing the images.");
    } else {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      setMessage(payload?.message ?? (ar ? "تعذر إنشاء ملف PDF." : "The PDF could not be generated."));
    }
    setBusy(false);
  }

  return (
    <section className="software-image-pdf" data-software-experience="images-to-pdf" data-software-route="/software/files/images-to-pdf">
      <header><div><span><Icon name="pieChart" /></span><h1>{ar ? "تحويل الصور إلى PDF" : "Images to PDF"}</h1><p>{ar ? "رتب صورك، اختر إعداد الصفحة، ثم أنشئ ملف PDF حقيقيًا." : "Order your images, choose page settings, then create a real PDF."}</p></div><Link href="/software/files">{ar ? "العودة إلى أدوات الملفات" : "Back to file tools"}<Icon name="arrow" /></Link></header>
      <div className="software-image-pdf__layout">
        <main>
          <label className="software-image-pdf__drop" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><Icon name="briefcase" /><strong>{ar ? "اسحب الصور هنا أو اضغط للاختيار" : "Drop images here or choose files"}</strong><small>JPG, PNG · {ar ? "حتى 8 صور" : "up to 8 images"}</small><input accept="image/jpeg,image/png" multiple onChange={(event) => addFiles(Array.from(event.target.files ?? []))} type="file" /></label>
          <section className="software-image-pdf__files"><header><h2>{ar ? `${files.length} صور مضافة` : `${files.length} images added`}</h2>{files.length ? <button onClick={() => setFiles([])} type="button"><Icon name="x" />{ar ? "إزالة الكل" : "Remove all"}</button> : null}</header>{previews.length ? <div>{previews.map((preview, index) => <article key={`${preview.file.name}-${preview.file.lastModified}`}><span>{index + 1}</span><Image alt="" height={160} src={preview.url} unoptimized width={240} /><small>{preview.file.name}</small><div><button aria-label={ar ? "تحريك للخلف" : "Move backward"} disabled={index === 0} onClick={() => move(index, -1)} type="button">‹</button><button aria-label={ar ? "حذف الصورة" : "Remove image"} onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} type="button"><Icon name="x" /></button><button aria-label={ar ? "تحريك للأمام" : "Move forward"} disabled={index === files.length - 1} onClick={() => move(index, 1)} type="button">›</button></div></article>)}</div> : <p>{ar ? "لم تُضف صور بعد. ستظهر المعاينة والترتيب هنا." : "No images selected. Previews and ordering will appear here."}</p>}</section>
          <section className="software-image-pdf__settings"><div><h2><Icon name="settings" />{ar ? "إعدادات إخراج PDF" : "PDF output settings"}</h2><label>{ar ? "حجم الصفحة" : "Page size"}<select onChange={(event) => setPageSize(event.target.value)} value={pageSize}><option value="A4">A4</option><option value="LETTER">Letter</option><option value="ORIGINAL">{ar ? "حجم الصورة" : "Image size"}</option></select></label><label>{ar ? "اتجاه الصفحة" : "Orientation"}<select onChange={(event) => setOrientation(event.target.value)} value={orientation}><option value="auto">{ar ? "تلقائي" : "Automatic"}</option><option value="portrait">{ar ? "عمودي" : "Portrait"}</option><option value="landscape">{ar ? "أفقي" : "Landscape"}</option></select></label></div><aside><Icon name="shield" /><strong>{ar ? "معالجة خاصة" : "Private processing"}</strong><p>{ar ? "تُرسل الصور للمعالجة اللحظية ولا تُحفظ في ملفات المنصة." : "Images are processed for this request and are not retained in platform storage."}</p></aside></section>
          <button className="software-image-pdf__submit" disabled={!files.length || busy} onClick={() => void convert()} type="button"><Icon name="sparkles" />{busy ? (ar ? "جارٍ إنشاء PDF..." : "Creating PDF...") : (ar ? "بدء التحويل" : "Create PDF")}</button>
          {message ? <p className="software-operation-message" role="status">{message}</p> : null}
        </main>
        <aside className="software-image-pdf__preview"><header><Icon name="eye" /><h2>{ar ? "معاينة مباشرة" : "Live preview"}</h2></header>{previews[0] ? <div><span>{pageSize}</span><Image alt={ar ? "معاينة الصورة الأولى" : "First image preview"} height={720} src={previews[0].url} unoptimized width={540} /></div> : <div className="software-image-pdf__empty"><Icon name="pieChart" /><p>{ar ? "اختر صورة لعرض المعاينة." : "Choose an image to preview the output."}</p></div>}<section><h3>{ar ? "معلومات الملف الناتج" : "Output summary"}</h3><p><span>{ar ? "عدد الصفحات" : "Pages"}</span><b>{files.length || "—"}</b></p><p><span>{ar ? "المقاس" : "Page size"}</span><b>{pageSize}</b></p><p><span>{ar ? "الاتجاه" : "Orientation"}</span><b>{orientation}</b></p></section></aside>
      </div>
    </section>
  );
}

function ConversionWorkspace({ action, locale, route }: { action: string; locale: Locale; route: string }) {
  const ar = locale === "ar";
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const definitions: Record<string, { accept: string; extension: string; from: string; to: string }> = {
    docxToPdf: { accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "pdf", from: "Word", to: "PDF" },
    pdfToDocx: { accept: ".pdf,application/pdf", extension: "docx", from: "PDF", to: "Word" },
    pdfToXlsx: { accept: ".pdf,application/pdf", extension: "xlsx", from: "PDF", to: "Excel" },
    xlsxToPdf: { accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "pdf", from: "Excel", to: "PDF" },
  };
  const definition = definitions[action];

  async function convert() {
    if (!file) return;
    setBusy(true); setMessage("");
    const form = new FormData();
    form.set("action", action);
    form.append("files", file);
    const response = await fetch("/api/software/documents", { method: "POST", body: form });
    if (response.ok) {
      triggerDownload(await response.blob(), `jenan-converted.${definition.extension}`);
      setMessage(ar ? "اكتمل التحويل ونُزّل الملف. قد يختلف التنسيق المعقد عن المصدر." : "Conversion completed and downloaded. Complex source formatting may differ.");
    } else {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      setMessage(payload?.message ?? (ar ? "تعذر تحويل الملف." : "The file could not be converted."));
    }
    setBusy(false);
  }

  return (
    <section className="software-converter" data-software-experience="conversion" data-software-route={route}>
      <header><div><Icon name="activity" /><span><h1>{ar ? "مركز تحويل الملفات" : "Document conversion center"}</h1><p>{ar ? "تحويلات عملية مع توضيح حدود الحفاظ على التنسيق." : "Practical conversions with explicit formatting limitations."}</p></span></div><Link href="/software/files">{ar ? "كل الأدوات" : "All tools"}<Icon name="arrow" /></Link></header>
      <nav>{Object.entries(definitions).map(([conversionAction, item]) => <Link aria-current={conversionAction === action ? "page" : undefined} href={fileTools.find((tool) => tool.label[1] === `${item.from} to ${item.to}`)?.href ?? `/software/files/${item.from.toLocaleLowerCase()}-to-${item.to.toLocaleLowerCase()}`} key={conversionAction}><span>{item.from}</span><Icon name="arrow" /><b>{item.to}</b></Link>)}</nav>
      <div className="software-converter__layout">
        <aside><h2><Icon name="settings" />{ar ? "إعدادات التحويل" : "Conversion settings"}</h2><label>{ar ? "نوع التحويل" : "Conversion"}<input readOnly value={`${definition.from} → ${definition.to}`} /></label><div><Icon name="shield" /><p>{ar ? "لا يُحفظ محتوى الملف. التحويل النصي يحافظ على المحتوى والبنية الأساسية، وقد لا يحافظ على التخطيطات المعقدة." : "File content is not retained. Text conversion preserves core content and structure, but complex layouts may differ."}</p></div></aside>
        <main><h2>{ar ? "الملف المصدر" : "Source file"}</h2><label className="software-converter__drop"><Icon name="briefcase" /><strong>{ar ? `اسحب ملف ${definition.from} هنا` : `Drop a ${definition.from} file here`}</strong><small>{ar ? "أو اضغط للاختيار من جهازك" : "or choose from your device"}</small><input accept={definition.accept} onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} type="file" /></label>{file ? <article><Icon name="briefcase" /><div><strong>{file.name}</strong><small>{(file.size / 1_048_576).toFixed(2)} MB</small></div><button aria-label={ar ? "إزالة الملف" : "Remove file"} onClick={() => setFile(null)} type="button"><Icon name="x" /></button></article> : null}<button disabled={!file || busy} onClick={() => void convert()} type="button"><Icon name="sparkles" />{busy ? (ar ? "جارٍ التحويل..." : "Converting...") : (ar ? `تحويل إلى ${definition.to}` : `Convert to ${definition.to}`)}</button>{message ? <p className="software-operation-message" role="status">{message}</p> : null}</main>
        <aside className="software-converter__preview"><h2><Icon name="eye" />{ar ? "معاينة العملية" : "Operation preview"}</h2><div><Icon name="briefcase" /><span>{definition.from}</span><Icon name="arrow" /><Icon name="briefcase" /><span>{definition.to}</span></div><p>{file ? file.name : (ar ? "اختر ملفًا لبدء التحويل." : "Choose a file to begin.")}</p></aside>
      </div>
    </section>
  );
}

function DesignDashboard({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { documents, loadError, loading } = useSoftwareRecords();
  const documentRoutes: Record<StudioDocument["kind"], string> = {
    CV: "/software/design/cv",
    DOCS: "/software/design/docs",
    LETTERHEAD: "/software/design/letterhead",
    LOGO: "/software/design/logo",
    PRESENTATION: "/software/design/presentations",
    SHEETS: "/software/design/sheets",
  };
  return (
    <section className="software-design" data-software-experience="design" data-software-route="/software/design">
      <header className="software-design__hero"><div><span><Icon name="sparkles" /></span><h1>{ar ? "استوديو التصميم" : "Design studio"}</h1><p>{ar ? "حوّل أفكارك إلى أصول مهنية محفوظة بإصدارات ويمكن تنزيلها أو طباعتها." : "Turn ideas into versioned professional assets that can be exported or printed."}</p><div><b>{ar ? "قوالب جاهزة" : "Ready templates"}</b><b>{ar ? "تصاميم عصرية" : "Modern designs"}</b><b>{ar ? "حفظ بإذن المستخدم" : "User-directed saves"}</b></div></div><aside aria-hidden="true"><Icon name="sparkles" /><b>Jenan PRO</b></aside></header>
      <section className="software-design__tools">{designTools.map((tool) => <Link href={tool.href} key={tool.href}><div><Icon name={tool.icon} /></div><h2>{pick(tool.label, locale)}</h2><p>{pick(tool.copy, locale)}</p><span>{ar ? "ابدأ التصميم" : "Start designing"}<Icon name="arrow" /></span></Link>)}</section>
      <div className="software-design__middle">
        <section><header><h2>{ar ? "أحدث مشاريعي" : "Recent projects"}</h2><Link href="/software/design/history">{ar ? "عرض جميع المشاريع" : "View all projects"}</Link></header>{loading ? <p>{ar ? "جارٍ تحميل المشاريع..." : "Loading projects..."}</p> : loadError ? <p>{loadError}</p> : documents.length ? <div>{documents.slice(0, 5).map((document) => <Link href={`${documentRoutes[document.kind]}?document=${document.id}`} key={document.id}><span><Icon name={document.kind === "CV" ? "user" : document.kind === "LOGO" ? "sparkles" : "briefcase"} /></span><strong>{document.title}</strong><small>{document.kind} · v{document.currentVersion}<br />{formatDate(document.updatedAt, locale)}</small></Link>)}</div> : <p>{ar ? "لا توجد مشاريع محفوظة بعد. اختر نوع تصميم وابدأ مشروعك الأول." : "No saved projects yet. Choose a design type to begin."}</p>}</section>
        <aside><h2><Icon name="activity" />{ar ? "ابدأ بسرعة" : "Quick start"}</h2><Link href="/software/design/logo"><Icon name="sparkles" />{ar ? "شعار سريع" : "Quick logo"}</Link><Link href="/software/design/letterhead"><Icon name="mail" />{ar ? "ورق رسمي" : "Letterhead"}</Link><Link href="/software/design/cv"><Icon name="user" />{ar ? "سيرة ذاتية" : "CV"}</Link><Link href="/software/design/docs"><Icon name="briefcase" />{ar ? "ملف شركة" : "Company profile"}</Link></aside>
      </div>
      <section className="software-design__styles"><header><h2>{ar ? "أنماط التصميم الجاهزة" : "Ready design directions"}</h2><p>{ar ? "اختر الاتجاه المناسب ثم خصص الألوان والمحتوى داخل المحرر." : "Choose a direction, then customize color and content in the editor."}</p></header><div><article><span /><b>{ar ? "عصري تقني" : "Technical"}</b><small>{ar ? "ألوان تقنية وإشارات حديثة" : "Modern signals and technical color"}</small></article><article><span /><b>{ar ? "فاخر ملكي" : "Premium"}</b><small>{ar ? "للعلامات التجارية الراقية" : "For premium identities"}</small></article><article><span /><b>{ar ? "كلاسيكي أنيق" : "Classic"}</b><small>{ar ? "للكيانات الرسمية" : "For formal organizations"}</small></article><article><span /><b>{ar ? "طبيعي هادئ" : "Natural"}</b><small>{ar ? "للمشاريع البيئية والصحية" : "For environmental and health work"}</small></article></div></section>
    </section>
  );
}

export function SoftwareExperienceWorkspace({ locale, route }: { locale: Locale; route: SoftwareExperienceRoute }) {
  if (route.kind === "portal") return <Portal locale={locale} />;
  if (route.kind === "files") return <FileDashboard locale={locale} />;
  if (route.kind === "images-to-pdf") return <ImageToPdfWorkspace locale={locale} />;
  if (route.kind === "conversion") return <ConversionWorkspace action={route.action} locale={locale} route={route.route} />;
  if (route.kind === "pdf-tool") return <section className="software-pdf-tool" data-software-experience="pdf-tool" data-software-route={route.route}><StudioPdfWorkspace editor editorHref="/software/files/merge-pdf" initialTool={route.tool} locale={locale} /></section>;
  if (route.kind === "design") return <DesignDashboard locale={locale} />;
  return null;
}
