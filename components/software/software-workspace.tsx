"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type DocxAnalysis = { text: string; paragraphCount: number; wordCount: number };
type WorkbookAnalysis = { sheets: { name: string; rowCount: number; columnCount: number; previewRows: string[][] }[] };

export function SoftwareWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [pdfs, setPdfs] = useState<File[]>([]);
  const [splitPdfFile, setSplitPdfFile] = useState<File | null>(null);
  const [ranges, setRanges] = useState("");
  const [docx, setDocx] = useState<File | null>(null);
  const [xlsx, setXlsx] = useState<File | null>(null);
  const [designImage, setDesignImage] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<DocxAnalysis | null>(null);
  const [workbook, setWorkbook] = useState<WorkbookAnalysis | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [busy, setBusy] = useState<"merge" | "split" | "analyze" | "spreadsheet" | "design" | null>(null);
  const [message, setMessage] = useState("");

  function selectPdfs(event: ChangeEvent<HTMLInputElement>) {
    setPdfs(Array.from(event.target.files ?? []));
  }

  async function mergePdfs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pdfs.length) return;
    setBusy("merge"); setMessage("");
    const form = new FormData(); form.set("action", "mergePdf"); pdfs.forEach((file) => form.append("files", file));
    const response = await fetch("/api/software/documents", { method: "POST", body: form });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      setMessage(payload?.message ?? (ar ? "تعذر دمج الملفات." : "Files could not be merged."));
    } else {
      const url = URL.createObjectURL(await response.blob());
      const download = document.createElement("a"); download.href = url; download.download = "jenan-merged.pdf"; download.click(); URL.revokeObjectURL(url);
      setMessage(ar ? "تم إنشاء ملف PDF موحد." : "Merged PDF created.");
    }
    setBusy(null);
  }

  async function analyzeDocx(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!docx) return;
    setBusy("analyze"); setMessage(""); setAnalysis(null);
    const form = new FormData(); form.set("action", "analyzeDocx"); form.append("files", docx);
    const response = await fetch("/api/software/documents", { method: "POST", body: form });
    const payload = await response.json().catch(() => null) as { document?: DocxAnalysis; message?: string } | null;
    if (response.ok && payload?.document) setAnalysis(payload.document);
    else setMessage(payload?.message ?? (ar ? "تعذر تحليل المستند." : "Document could not be analyzed."));
    setBusy(null);
  }

  async function splitPdf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!splitPdfFile) return;
    setBusy("split"); setMessage("");
    const form = new FormData(); form.set("action", "splitPdf"); form.set("ranges", ranges); form.append("files", splitPdfFile);
    const response = await fetch("/api/software/documents", { method: "POST", body: form });
    const payload = await response.json().catch(() => null) as { documents?: string[]; message?: string } | null;
    if (response.ok && payload?.documents?.length) {
      payload.documents.forEach((encodedDocument, index) => {
        const binary = atob(encodedDocument); const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const download = document.createElement("a"); download.href = url; download.download = `jenan-split-${index + 1}.pdf`; download.click(); URL.revokeObjectURL(url);
      });
      setMessage(ar ? `تم تنزيل ${payload.documents.length} ملفات PDF.` : `${payload.documents.length} PDF files downloaded.`);
    } else setMessage(payload?.message ?? (ar ? "تعذر تقسيم ملف PDF." : "PDF could not be split."));
    setBusy(null);
  }

  async function analyzeXlsx(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!xlsx) return;
    setBusy("spreadsheet"); setMessage(""); setWorkbook(null);
    const form = new FormData(); form.set("action", "analyzeXlsx"); form.append("files", xlsx);
    const response = await fetch("/api/software/documents", { method: "POST", body: form });
    const payload = await response.json().catch(() => null) as { workbook?: WorkbookAnalysis; message?: string } | null;
    if (response.ok && payload?.workbook) setWorkbook(payload.workbook);
    else setMessage(payload?.message ?? (ar ? "تعذر تحليل ملف Excel." : "Spreadsheet could not be analyzed."));
    setBusy(null);
  }

  async function extractPalette(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!designImage) return;
    setBusy("design"); setMessage(""); setPalette([]);
    const form = new FormData(); form.append("image", designImage);
    const response = await fetch("/api/software/design", { method: "POST", body: form });
    const payload = await response.json().catch(() => null) as { palette?: string[]; message?: string } | null;
    if (response.ok && payload?.palette) {
      setPalette(payload.palette);
      setMessage(ar ? "تم استخراج لوحة الألوان دون حفظ الصورة." : "Palette extracted without storing the image.");
    } else setMessage(payload?.message ?? (ar ? "تعذر تحليل الهوية البصرية." : "Visual identity could not be analyzed."));
    setBusy(null);
  }

  return <section className="software-workspace">
    <header className="software-workspace__header"><div><span className="eyebrow eyebrow--small">JENAN SOFTWARE</span><h1>{ar ? "البرمجيات والأدوات" : "Software and tools"}</h1><p>{ar ? "أدوات مستندات عملية ومساحة للتصميم المهني. تعالج الملفات داخل الجلسة ولا تُحفظ في المنصة." : "Practical document tools and a professional design workspace. Files are processed in-session and are not stored."}</p></div></header>
    <section className="software-tool-grid">
      <form className="software-tool" onSubmit={mergePdfs}><div><span className="software-tool__tag">PDF</span><h2>{ar ? "دمج ملفات PDF" : "Merge PDF files"}</h2><p>{ar ? "رتّب الملفات في جهازك ثم أنشئ ملفًا موحدًا للتحميل." : "Select files from your device and create one downloadable document."}</p></div><input aria-label={ar ? "ملفات PDF" : "PDF files"} accept="application/pdf,.pdf" multiple onChange={selectPdfs} type="file" /><small>{pdfs.length ? (ar ? `${pdfs.length} ملفات محددة` : `${pdfs.length} file(s) selected`) : (ar ? "حتى 8 ملفات، 10 ميغابايت للملف" : "Up to 8 files, 10 MB each")}</small><button className="button button--primary" disabled={!pdfs.length || busy !== null} type="submit">{busy === "merge" ? (ar ? "جارٍ الدمج..." : "Merging...") : (ar ? "دمج وتنزيل" : "Merge and download")}</button></form>
      <form className="software-tool" onSubmit={splitPdf}><div><span className="software-tool__tag">PDF</span><h2>{ar ? "تقسيم ملف PDF" : "Split a PDF"}</h2><p>{ar ? "حدّد صفحات منفردة أو نطاقات مثل: 1-2, 3, 4-6." : "Enter pages or ranges, for example: 1-2, 3, 4-6."}</p></div><input aria-label={ar ? "ملف PDF للتقسيم" : "PDF file to split"} accept="application/pdf,.pdf" onChange={(event) => setSplitPdfFile(event.target.files?.[0] ?? null)} type="file" /><input aria-label={ar ? "نطاقات الصفحات" : "Page ranges"} placeholder="1-2, 3, 4-6" value={ranges} onChange={(event) => setRanges(event.target.value)} /><small>{splitPdfFile?.name ?? (ar ? "اترك النطاق فارغًا لتقسيم كل صفحة" : "Leave ranges blank to split every page")}</small><button className="button button--primary" disabled={!splitPdfFile || busy !== null} type="submit">{busy === "split" ? (ar ? "جارٍ التقسيم..." : "Splitting...") : (ar ? "تقسيم وتنزيل" : "Split and download")}</button></form>
      <form className="software-tool" onSubmit={analyzeDocx}><div><span className="software-tool__tag">DOCX</span><h2>{ar ? "فحص مستند Word" : "Inspect a Word document"}</h2><p>{ar ? "استخرج النص وعدد الفقرات والكلمات من ملف DOCX." : "Extract text plus paragraph and word counts from a DOCX file."}</p></div><input aria-label={ar ? "ملف Word" : "Word file"} accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx" onChange={(event) => setDocx(event.target.files?.[0] ?? null)} type="file" /><small>{docx?.name ?? (ar ? "ملف DOCX واحد، حتى 10 ميغابايت" : "One DOCX file, up to 10 MB")}</small><button className="button button--primary" disabled={!docx || busy !== null} type="submit">{busy === "analyze" ? (ar ? "جارٍ الفحص..." : "Inspecting...") : (ar ? "فحص المستند" : "Inspect document")}</button></form>
      <form className="software-tool" onSubmit={analyzeXlsx}><div><span className="software-tool__tag">XLSX</span><h2>{ar ? "فحص ملف Excel" : "Inspect an Excel file"}</h2><p>{ar ? "اعرض الأوراق وعدد الصفوف والأعمدة ومعاينة للبيانات." : "View sheets, row and column counts, and a compact data preview."}</p></div><input aria-label={ar ? "ملف Excel" : "Excel file"} accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx" onChange={(event) => setXlsx(event.target.files?.[0] ?? null)} type="file" /><small>{xlsx?.name ?? (ar ? "ملف XLSX واحد، حتى 10 ميغابايت" : "One XLSX file, up to 10 MB")}</small><button className="button button--primary" disabled={!xlsx || busy !== null} type="submit">{busy === "spreadsheet" ? (ar ? "جارٍ الفحص..." : "Inspecting...") : (ar ? "فحص الملف" : "Inspect file")}</button></form>
      <form className="software-tool software-tool--design" onSubmit={extractPalette}><div><span className="software-tool__tag">DESIGN</span><h2>{ar ? "لوحة الهوية البصرية" : "Brand palette"}</h2><p>{ar ? "استخرج ألوانًا مرجعية من شعار أو صورة لبدء تصميم احترافي." : "Extract reference colors from a logo or image to start a professional design."}</p></div><input aria-label={ar ? "صورة الهوية البصرية" : "Brand image"} accept="image/png,image/jpeg,image/webp" onChange={(event) => setDesignImage(event.target.files?.[0] ?? null)} type="file" /><small>{designImage?.name ?? (ar ? "PNG أو JPEG أو WebP حتى 5 ميغابايت" : "PNG, JPEG, or WebP up to 5 MB")}</small><button className="button button--primary" disabled={!designImage || busy !== null} type="submit">{busy === "design" ? (ar ? "جارٍ التحليل..." : "Analyzing...") : (ar ? "استخراج الألوان" : "Extract palette")}</button><Link className="software-tool__link" href="/studio/visual-dna">{ar ? "مساحة Visual DNA المتقدمة" : "Advanced Visual DNA workspace"}</Link></form>
    </section>
    {analysis ? <section className="software-analysis"><div><span>{ar ? "الكلمات" : "Words"}</span><strong>{analysis.wordCount}</strong></div><div><span>{ar ? "الفقرات" : "Paragraphs"}</span><strong>{analysis.paragraphCount}</strong></div><pre>{analysis.text || (ar ? "لا يحتوي المستند على نص قابل للاستخراج." : "No extractable text in this document.")}</pre></section> : null}
    {workbook ? <section className="software-analysis software-analysis--sheets">{workbook.sheets.map((sheet) => <article key={sheet.name}><h2>{sheet.name}</h2><p>{sheet.rowCount} {ar ? "صفوف" : "rows"} · {sheet.columnCount} {ar ? "أعمدة" : "columns"}</p><div>{sheet.previewRows.map((row, index) => <p key={index}>{row.join(" | ")}</p>)}</div></article>)}</section> : null}
    {palette.length ? <section className="software-palette" aria-label={ar ? "ألوان الهوية" : "Brand palette"}>{palette.map((color) => <button aria-label={color} key={color} onClick={() => navigator.clipboard.writeText(color)} style={{ backgroundColor: color }} type="button"><span>{color}</span></button>)}</section> : null}
    {message ? <p className="software-message" role="status">{message}</p> : null}
  </section>;
}