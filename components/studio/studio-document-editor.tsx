"use client";

import Image from "next/image";
import { ChangeEvent, useState } from "react";

import { Icon } from "@/components/ui/icons";
import { evaluateSheetRows } from "@/lib/studio/formula-engine";
import type { Locale } from "@/types/i18n";
import type { StudioDocumentKind } from "./studio-types";

type EditorProps = {
  busy: boolean;
  content: Record<string, unknown>;
  currentVersion?: number;
  kind: StudioDocumentKind;
  locale: Locale;
  message: string;
  onChange: (content: Record<string, unknown>) => void;
  onNew: () => void;
  onSave: () => void;
  onTitleChange: (title: string) => void;
  title: string;
};

function text(content: Record<string, unknown>, key: string) {
  return typeof content[key] === "string" ? content[key] as string : "";
}

function numeric(content: Record<string, unknown>, key: string) {
  const value = Number(content[key]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function rows(content: Record<string, unknown>) {
  const value = content.rows;
  return Array.isArray(value) ? value.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []) : [];
}

function slides(content: Record<string, unknown>) {
  const value = content.slides;
  if (!Array.isArray(value)) return [{ title: "", body: "", layout: "title", chartData: "", imageData: "", imageName: "", imageWidth: 0, imageHeight: 0 }];
  return value.map((slide) => {
    const record = typeof slide === "object" && slide !== null ? slide as Record<string, unknown> : {};
    return { title: String(record.title ?? ""), body: String(record.body ?? ""), layout: String(record.layout ?? "title"), chartData: String(record.chartData ?? ""), imageData: String(record.imageData ?? ""), imageName: String(record.imageName ?? ""), imageWidth: Number(record.imageWidth) || 0, imageHeight: Number(record.imageHeight) || 0 };
  });
}

function parsePresentationChart(value: string) {
  return value.split(/[\n,]+/).map((entry) => {
    const separator = entry.lastIndexOf(":");
    if (separator < 1) return null;
    const label = entry.slice(0, separator).trim();
    const amount = Number(entry.slice(separator + 1).trim());
    return label && Number.isFinite(amount) ? { label, value: amount } : null;
  }).filter((item): item is { label: string; value: number } => item !== null).slice(0, 8);
}

function downloadBlob(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const download = document.createElement("a");
  download.href = url;
  download.download = name;
  download.click();
  URL.revokeObjectURL(url);
}

async function compressStudioImage(file: File) {
  if (!file.type.startsWith("image/") || file.size > 5_000_000) throw new Error("Invalid image");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new globalThis.Image();
    image.src = sourceUrl;
    await new Promise<void>((resolve, reject) => { image.addEventListener("load", () => resolve(), { once: true }); image.addEventListener("error", () => reject(new Error("Invalid image")), { once: true }); });
    const scale = Math.min(1, 1280 / image.naturalWidth, 720 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.82;
    let data = canvas.toDataURL("image/jpeg", quality);
    while (data.length > 105_000 && quality > 0.42) {
      quality -= 0.1;
      data = canvas.toDataURL("image/jpeg", quality);
    }
    if (data.length > 105_000) throw new Error("Compressed image is too large");
    return { data, height: canvas.height, width: canvas.width };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

type SheetFilterOperator = "contains" | "equals" | "greater" | "less";
type SheetFilter = { column: string; operator: SheetFilterOperator; query: string };

const emptySheetFilter = (): SheetFilter => ({ column: "", operator: "contains", query: "" });

const presentationThemes = [
  { id: "midnight", label: ["مجلس ليلي", "Midnight board"], description: ["داكن تنفيذي", "Executive dark"], background: "#06111f", surface: "#16d9c5" },
  { id: "paper", label: ["موجز ورقي", "Paper brief"], description: ["فاتح تحليلي", "Analytical light"], background: "#f5f1e8", surface: "#126e73" },
  { id: "signal", label: ["إشارة جريئة", "Signal deck"], description: ["تباين للقرارات", "Decision contrast"], background: "#17191e", surface: "#f4c86a" },
] as const;

function matchesSheetFilter(value: unknown, filter: SheetFilter) {
  const actual = String(value ?? "").trim();
  const expected = filter.query.trim();
  if (!filter.column || !expected) return true;
  if (filter.operator === "equals") return actual.localeCompare(expected, undefined, { sensitivity: "accent" }) === 0;
  if (filter.operator === "greater" || filter.operator === "less") {
    const actualNumber = Number(actual);
    const expectedNumber = Number(expected);
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
    return filter.operator === "greater" ? actualNumber > expectedNumber : actualNumber < expectedNumber;
  }
  return actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
}

export function StudioDocumentEditor(props: EditorProps) {
  const { busy, content, currentVersion, kind, locale, message, onChange, onNew, onSave, onTitleChange, title } = props;
  const ar = locale === "ar";
  const [importing, setImporting] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [sheetFilters, setSheetFilters] = useState<SheetFilter[]>([emptySheetFilter()]);
  const [sheetFilterJoin, setSheetFilterJoin] = useState<"and" | "or">("and");
  const [sheetMetricColumn, setSheetMetricColumn] = useState("");

  function update(key: string, value: unknown) {
    onChange({ ...content, [key]: value });
  }

  async function importDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const form = new FormData();
    form.set("action", kind === "DOCS" ? "analyzeDocx" : "analyzeXlsx");
    form.append("files", file);
    const response = await fetch("/api/software/documents", { method: "POST", body: form });
    const payload = await response.json().catch(() => null) as { document?: { text: string }; workbook?: { sheets: { previewRows: string[][] }[] }; message?: string } | null;
    if (response.ok && kind === "DOCS" && payload?.document) update("body", payload.document.text);
    if (response.ok && kind === "SHEETS" && payload?.workbook?.sheets[0]) update("rows", payload.workbook.sheets[0].previewRows);
    setImporting(false);
    event.target.value = "";
  }

  function appendDocumentBlock(value: string) {
    const body = text(content, "body");
    update("body", `${body}${body ? "\n\n" : ""}${value}`);
  }

  function importLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 100_000) { setExportMessage(ar ? "حجم الشعار يجب ألا يتجاوز 100KB." : "Logo size must not exceed 100KB."); event.target.value = ""; return; }
    const reader = new FileReader();
    reader.addEventListener("load", () => update("logoData", String(reader.result ?? "")), { once: true });
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function importSlideImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const image = await compressStudioImage(file);
      update("slides", presentationSlides.map((slide, index) => index === selectedSlide ? { ...slide, imageData: image.data, imageHeight: image.height, imageName: file.name, imageWidth: image.width } : slide));
      setExportMessage(ar ? "أُضيفت الصورة وضُغطت للحفظ والتصدير." : "Image added and compressed for saving and export.");
    } catch {
      setExportMessage(ar ? "تعذرت معالجة الصورة. جرّب صورة أصغر." : "The image could not be processed. Try a smaller image.");
    }
  }

  async function importDocumentImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const image = await compressStudioImage(file);
      onChange({ ...content, imageData: image.data, imageHeight: image.height, imageName: file.name, imageWidth: image.width });
      setExportMessage(ar ? "أُضيفت الصورة إلى المستند." : "Image added to the document.");
    } catch {
      setExportMessage(ar ? "تعذرت معالجة الصورة. الحد الأقصى 5MB." : "The image could not be processed. The limit is 5 MB.");
    }
  }

  function exportCsv() {
    const output = rows(content).map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    downloadBlob(`\uFEFF${output}`, `${title.trim() || "jenan-sheet"}.csv`, "text/csv;charset=utf-8");
  }

  function exportLogo() {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext("2d");
    if (!context) return;
    const primary = text(content, "primary") || "#16d9c5";
    const accent = text(content, "accent") || "#f4c86a";
    const style = text(content, "style") || "geometric";
    context.fillStyle = "#07111f";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = primary;
    context.lineWidth = 14;
    context.fillStyle = primary;
    context.textBaseline = "middle";
    if (style === "wordmark") {
      context.font = "700 118px Alexandria, sans-serif";
      context.textAlign = "center";
      context.fillText(text(content, "name") || "Brand name", 600, 280);
      context.fillRect(260, 375, 680, 9);
    } else {
      if (style === "monogram") { context.beginPath(); context.arc(315, 315, 255, 0, Math.PI * 2); context.stroke(); }
      else context.strokeRect(54, 54, 522, 522);
      context.font = "700 210px Alexandria, sans-serif";
      context.textAlign = "center";
      context.fillText(text(content, "initials") || "JP", 315, 325);
    }
    context.textAlign = "left";
    context.fillStyle = "#f7fbff";
    context.font = "700 58px Alexandria, sans-serif";
    if (style !== "wordmark") context.fillText(text(content, "name") || "Brand name", 650, 285);
    context.fillStyle = accent;
    context.font = "400 28px Alexandria, sans-serif";
    context.fillText(text(content, "tagline") || "", style === "wordmark" ? 440 : 650, style === "wordmark" ? 440 : 348);
    canvas.toBlob((blob) => blob && downloadBlob(blob, `${title.trim() || "jenan-logo"}.png`, "image/png"), "image/png");
  }

  function exportLogoSvg() {
    const primary = text(content, "primary") || "#16d9c5";
    const accent = text(content, "accent") || "#f4c86a";
    const initials = escapeXml(text(content, "initials") || "JP");
    const name = escapeXml(text(content, "name") || "Brand name");
    const tagline = escapeXml(text(content, "tagline"));
    const style = text(content, "style") || "geometric";
    const mark = style === "wordmark" ? `<text x="600" y="300" fill="${primary}" font-family="Arial,sans-serif" font-size="118" font-weight="700" text-anchor="middle">${name}</text><rect x="260" y="375" width="680" height="9" fill="${primary}"/>` : `${style === "monogram" ? `<circle cx="315" cy="315" r="255" fill="none" stroke="${primary}" stroke-width="14"/>` : `<rect x="54" y="54" width="522" height="522" fill="none" stroke="${primary}" stroke-width="14"/>`}<text x="315" y="350" fill="${primary}" font-family="Arial,sans-serif" font-size="210" font-weight="700" text-anchor="middle">${initials}</text><text x="650" y="285" fill="#f7fbff" font-family="Arial,sans-serif" font-size="58" font-weight="700">${name}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#07111f"/>${mark}<text x="${style === "wordmark" ? 440 : 650}" y="${style === "wordmark" ? 440 : 348}" fill="${accent}" font-family="Arial,sans-serif" font-size="28">${tagline}</text></svg>`;
    downloadBlob(svg, `${title.trim() || "jenan-logo"}.svg`, "image/svg+xml;charset=utf-8");
  }

  async function exportNative() {
    if (!["DOCS", "SHEETS", "PRESENTATION", "LETTERHEAD"].includes(kind) || title.trim().length < 2) return;
    setExportMessage("");
    const response = await fetch("/api/studio/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, kind, title }) });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      setExportMessage(payload?.message ?? (ar ? "تعذر إنشاء الملف." : "The file could not be generated."));
      return;
    }
    const extension = kind === "SHEETS" ? "xlsx" : kind === "PRESENTATION" ? "pptx" : "docx";
    downloadBlob(await response.blob(), `${title.trim()}.${extension}`, response.headers.get("content-type") ?? "application/octet-stream");
    setExportMessage(ar ? `تم إنشاء ${extension.toUpperCase()} حقيقي.` : `Native ${extension.toUpperCase()} generated.`);
  }

  const kindLabels: Record<StudioDocumentKind, [string, string]> = {
    DOCS: ["مستند", "Document"],
    SHEETS: ["جدول", "Spreadsheet"],
    PRESENTATION: ["عرض", "Presentation"],
    LOGO: ["هوية", "Brand"],
    LETTERHEAD: ["ورق رسمي", "Letterhead"],
    CV: ["سيرة ذاتية", "CV"],
  };

  const sheetRows = rows(content);
  const computedSheetRows = evaluateSheetRows(sheetRows);
  const activeSheetFilters = sheetFilters.filter((filter) => filter.column && filter.query.trim());
  const filteredSheetRows = sheetRows.map((row, index) => ({ index, row })).filter(({ index }) => {
    if (index === 0 || !activeSheetFilters.length) return true;
    const results = activeSheetFilters.map((filter) => matchesSheetFilter(computedSheetRows[index]?.[Number(filter.column)], filter));
    return sheetFilterJoin === "and" ? results.every(Boolean) : results.some(Boolean);
  });
  const numericSheetColumns = (computedSheetRows[0] ?? []).map((_, columnIndex) => columnIndex).filter((columnIndex) => computedSheetRows.slice(1).some((row) => String(row[columnIndex] ?? "").trim() !== "" && Number.isFinite(Number(row[columnIndex]))));
  const chartColumnIndex = sheetMetricColumn && numericSheetColumns.includes(Number(sheetMetricColumn)) ? Number(sheetMetricColumn) : numericSheetColumns[0] ?? -1;
  const visibleComputedRows = filteredSheetRows.filter(({ index }) => index > 0).map(({ index }) => computedSheetRows[index] ?? []);
  const chartRows = chartColumnIndex >= 0 ? visibleComputedRows.map((row, index) => ({ label: String(row[0] || `${index + 1}`), value: Number(row[chartColumnIndex]) })).filter((item) => Number.isFinite(item.value)).slice(0, 8) : [];
  const chartMax = Math.max(1, ...chartRows.map((item) => Math.abs(item.value)));
  const sheetMetricValues = chartColumnIndex >= 0 ? visibleComputedRows.map((row) => Number(row[chartColumnIndex])).filter(Number.isFinite) : [];
  const sheetMetricTotal = sheetMetricValues.reduce((total, value) => total + value, 0);
  const sheetMetricAverage = sheetMetricValues.length ? sheetMetricTotal / sheetMetricValues.length : null;
  const sheetNumber = new Intl.NumberFormat(ar ? "ar-SA" : "en-GB", { maximumFractionDigits: 2 });
  const presentationSlides = slides(content);
  const activeSlide = presentationSlides[Math.min(selectedSlide, presentationSlides.length - 1)] ?? { title: "", body: "", layout: "title", chartData: "", imageData: "", imageName: "", imageWidth: 0, imageHeight: 0 };
  const presentationTheme = text(content, "theme") || "midnight";
  const presentationChart = parsePresentationChart(activeSlide.chartData);
  const presentationChartMax = Math.max(1, ...presentationChart.map((item) => Math.abs(item.value)));

  return (
    <section className={`studio-editor studio-editor--${kind.toLowerCase()}`}>
      <header className="studio-editor__toolbar">
        <div><span>{ar ? kindLabels[kind][0] : kindLabels[kind][1]}</span><strong>{currentVersion ? `v${currentVersion}` : (ar ? "غير محفوظ" : "Unsaved")}</strong></div>
        <input aria-label={ar ? "عنوان المشروع" : "Project title"} onChange={(event) => onTitleChange(event.target.value)} placeholder={ar ? "عنوان المشروع" : "Project title"} value={title} />
        <div className="studio-editor__actions">
          <button className="button button--ghost" onClick={() => { setExportMessage(""); onNew(); }} type="button"><Icon name="plus" />{ar ? "جديد" : "New"}</button>
          <button className="button button--primary" disabled={busy || title.trim().length < 2} onClick={() => { setExportMessage(""); onSave(); }} type="button"><Icon name="check" />{busy ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "حفظ إصدار" : "Save version")}</button>
          <button className="button button--ghost" onClick={() => window.print()} type="button">{ar ? "طباعة / PDF" : "Print / PDF"}</button>
          {kind === "DOCS" || kind === "LETTERHEAD" ? <button className="button button--ghost" disabled={title.trim().length < 2} onClick={() => void exportNative()} type="button">DOCX</button> : null}
          {kind === "SHEETS" ? <><button className="button button--ghost" onClick={exportCsv} type="button">CSV</button><button className="button button--ghost" disabled={title.trim().length < 2} onClick={() => void exportNative()} type="button">XLSX</button></> : null}
          {kind === "PRESENTATION" ? <button className="button button--ghost" disabled={title.trim().length < 2} onClick={() => void exportNative()} type="button">PPTX</button> : null}
          {kind === "LOGO" ? <><button className="button button--ghost" onClick={exportLogo} type="button">PNG</button><button className="button button--ghost" onClick={exportLogoSvg} type="button">SVG</button></> : null}
        </div>
      </header>

      {kind === "DOCS" ? <div className="studio-doc-layout">
        <aside>
          <strong>{ar ? "القوالب" : "Templates"}</strong>
          <button onClick={() => update("body", "")} type="button">{ar ? "مستند فارغ" : "Blank document"}</button>
          <button onClick={() => update("body", ar ? "# مذكرة القرار\n\n## الملخص\n\n- السياق\n- البدائل\n- التوصية\n\n## القرار المطلوب" : "# Decision memo\n\n## Summary\n\n- Context\n- Alternatives\n- Recommendation\n\n## Decision required")} type="button">{ar ? "مذكرة قرار" : "Decision memo"}</button>
          <button onClick={() => update("body", ar ? "# مقترح المشروع\n\n## الهدف\n\n## نطاق العمل\n\n## الجدول الزمني\n\n| المرحلة | المالك | الموعد |\n| البداية | — | — |" : "# Project proposal\n\n## Objective\n\n## Scope\n\n## Timeline\n\n| Phase | Owner | Date |\n| Start | — | — |")} type="button">{ar ? "مقترح مشروع" : "Project proposal"}</button>
          <button onClick={() => update("body", ar ? "# محضر الاجتماع\n\n## الحضور\n\n## القرارات\n\n- قرار 1\n\n## الإجراءات\n\n| الإجراء | المسؤول | الموعد |" : "# Meeting notes\n\n## Attendees\n\n## Decisions\n\n- Decision 1\n\n## Actions\n\n| Action | Owner | Due |")} type="button">{ar ? "محضر اجتماع" : "Meeting notes"}</button>
          <strong>{ar ? "إدراج" : "Insert"}</strong>
          <button onClick={() => appendDocumentBlock("# Heading")} type="button">H1</button>
          <button onClick={() => appendDocumentBlock("## Heading")} type="button">H2</button>
          <button onClick={() => appendDocumentBlock("- Item")} type="button">{ar ? "قائمة" : "List"}</button>
          <button onClick={() => appendDocumentBlock("| Column 1 | Column 2 |\n| Value | Value |") } type="button">{ar ? "جدول" : "Table"}</button>
          <strong>{ar ? "إعداد الصفحة" : "Page setup"}</strong>
          <label>{ar ? "النمط" : "Style"}<select aria-label={ar ? "نمط المستند" : "Document style"} onChange={(event) => update("style", event.target.value)} value={text(content, "style") || "executive"}><option value="executive">{ar ? "تنفيذي" : "Executive"}</option><option value="editorial">{ar ? "تحريري" : "Editorial"}</option><option value="compact">{ar ? "مضغوط" : "Compact"}</option></select></label>
          <label>{ar ? "المقاس" : "Page size"}<select aria-label={ar ? "مقاس المستند" : "Document page size"} onChange={(event) => update("pageSize", event.target.value)} value={text(content, "pageSize") || "A4"}><option value="A4">A4</option><option value="LETTER">US Letter</option></select></label>
          <input aria-label={ar ? "ترويسة المستند" : "Document header"} onChange={(event) => update("header", event.target.value)} placeholder={ar ? "نص الترويسة" : "Header text"} value={text(content, "header")} />
          <input aria-label={ar ? "تذييل المستند" : "Document footer"} onChange={(event) => update("footer", event.target.value)} placeholder={ar ? "نص التذييل" : "Footer text"} value={text(content, "footer")} />
          <label className="studio-import"><input accept="image/png,image/jpeg,image/webp" onChange={(event) => void importDocumentImage(event)} type="file" /><span>{text(content, "imageName") || (ar ? "إضافة صورة" : "Add image")}</span></label>
          <label className="studio-import"><input accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={importDocument} type="file" /><span>{importing ? (ar ? "جارٍ الاستخراج..." : "Extracting...") : (ar ? "استيراد DOCX" : "Import DOCX")}</span></label>
        </aside>
        <textarea aria-label={ar ? "محتوى المستند" : "Document content"} onChange={(event) => update("body", event.target.value)} placeholder={ar ? "ابدأ الكتابة هنا..." : "Start writing here..."} value={text(content, "body")} />
        <article className={`studio-paper studio-paper--${text(content, "style") || "executive"} studio-paper--${(text(content, "pageSize") || "A4").toLowerCase()} studio-print-area`}><header>{text(content, "header") || "Jenan PRO Docs"}</header><h1>{title || (ar ? "مستند بلا عنوان" : "Untitled document")}</h1>{text(content, "imageData") ? <Image alt={text(content, "imageName")} height={numeric(content, "imageHeight") || 360} src={text(content, "imageData")} unoptimized width={numeric(content, "imageWidth") || 640} /> : null}{text(content, "body").split("\n").map((line, index) => line.startsWith("# ") ? <h2 key={index}>{line.slice(2)}</h2> : line.startsWith("## ") ? <h3 key={index}>{line.slice(3)}</h3> : line.startsWith("- ") ? <p className="studio-doc-list-item" key={index}>• {line.slice(2)}</p> : line.startsWith("|") ? <div className="studio-doc-table-row" key={index}>{line.split("|").slice(1, -1).map((cell, cellIndex) => <span key={cellIndex}>{cell.trim()}</span>)}</div> : <p key={index}>{line || "\u00a0"}</p>)}<footer>{text(content, "footer") || (ar ? "مستند محفوظ في Jenan PRO" : "Document saved in Jenan PRO")}</footer></article>
      </div> : null}

      {kind === "SHEETS" ? <div className="studio-sheet-layout">
        <div className="studio-sheet-tools">
          <label className="studio-import"><input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importDocument} type="file" /><span>{importing ? (ar ? "جارٍ القراءة..." : "Reading...") : (ar ? "استيراد XLSX" : "Import XLSX")}</span></label>
          <button onClick={() => update("rows", [...sheetRows, Array(sheetRows[0]?.length || 4).fill("")])} type="button"><Icon name="plus" />{ar ? "صف" : "Row"}</button>
          <button onClick={() => update("rows", sheetRows.map((row) => [...row, ""]))} type="button"><Icon name="plus" />{ar ? "عمود" : "Column"}</button>
          <span>{sheetRows.length} × {sheetRows[0]?.length ?? 0}</span>
        </div>
        <section className="studio-sheet-filters" aria-label={ar ? "فلاتر الجدول" : "Sheet filters"}>
          <header><div><strong>{ar ? "الفلاتر" : "Filters"}</strong><small>{ar ? "ادمج الشروط النصية والرقمية دون تغيير البيانات الأصلية." : "Combine text and numeric conditions without changing source data."}</small></div><div>{sheetFilters.length > 1 ? <select aria-label={ar ? "ربط شروط الفلترة" : "Filter condition join"} value={sheetFilterJoin} onChange={(event) => setSheetFilterJoin(event.target.value as "and" | "or")}><option value="and">AND</option><option value="or">OR</option></select> : null}<button onClick={() => setSheetFilters((current) => [...current, emptySheetFilter()])} type="button"><Icon name="plus" />{ar ? "شرط" : "Condition"}</button></div></header>
          <div>{sheetFilters.map((filter, filterIndex) => <div className="studio-sheet-filter" key={filterIndex}>
            <select aria-label={`${ar ? "عمود الفلترة" : "Filter column"} ${filterIndex + 1}`} value={filter.column} onChange={(event) => setSheetFilters((current) => current.map((item, index) => index === filterIndex ? { ...item, column: event.target.value } : item))}><option value="">{ar ? "اختر عمودًا" : "Choose a column"}</option>{(sheetRows[0] ?? []).map((heading, index) => <option key={index} value={index}>{heading || `${ar ? "عمود" : "Column"} ${index + 1}`}</option>)}</select>
            <select aria-label={`${ar ? "عامل الفلترة" : "Filter operator"} ${filterIndex + 1}`} disabled={!filter.column} value={filter.operator} onChange={(event) => setSheetFilters((current) => current.map((item, index) => index === filterIndex ? { ...item, operator: event.target.value as SheetFilterOperator } : item))}><option value="contains">{ar ? "يحتوي" : "Contains"}</option><option value="equals">{ar ? "يساوي" : "Equals"}</option><option value="greater">{ar ? "أكبر من" : "Greater than"}</option><option value="less">{ar ? "أقل من" : "Less than"}</option></select>
            <input aria-label={`${ar ? "قيمة الفلترة" : "Filter value"} ${filterIndex + 1}`} disabled={!filter.column} placeholder={ar ? "القيمة" : "Value"} value={filter.query} onChange={(event) => setSheetFilters((current) => current.map((item, index) => index === filterIndex ? { ...item, query: event.target.value } : item))} />
            <button aria-label={ar ? `حذف شرط الفلترة ${filterIndex + 1}` : `Remove filter condition ${filterIndex + 1}`} disabled={sheetFilters.length === 1} onClick={() => setSheetFilters((current) => current.filter((_, index) => index !== filterIndex))} title={ar ? "حذف الشرط" : "Remove condition"} type="button">×</button>
          </div>)}</div>
        </section>
        <section className="studio-sheet-kpis" aria-label={ar ? "مؤشرات الجدول" : "Sheet KPIs"}>
          <article><Icon name="grid" /><div><span>{ar ? "صفوف البيانات" : "Data rows"}</span><strong>{Math.max(0, sheetRows.length - 1)}</strong><small>{ar ? "المصدر: الجدول الحالي" : "Source: current sheet"}</small></div></article>
          <article><Icon name="activity" /><div><span>{ar ? "الصفوف الظاهرة" : "Visible rows"}</span><strong>{visibleComputedRows.length}</strong><small>{activeSheetFilters.length ? (ar ? `${activeSheetFilters.length} شروط نشطة` : `${activeSheetFilters.length} active condition${activeSheetFilters.length === 1 ? "" : "s"}`) : (ar ? "دون فلترة" : "No active filters")}</small></div></article>
          <article><Icon name="pieChart" /><div><span>{ar ? "المجموع" : "Total"}</span><strong>{sheetMetricValues.length ? sheetNumber.format(sheetMetricTotal) : "—"}</strong><small>{chartColumnIndex >= 0 ? String(computedSheetRows[0]?.[chartColumnIndex] || (ar ? "العمود الرقمي" : "Numeric column")) : (ar ? "لا توجد قيم رقمية" : "No numeric values")}</small></div></article>
          <article><Icon name="sparkles" /><div><span>{ar ? "المتوسط" : "Average"}</span><strong>{sheetMetricAverage === null ? "—" : sheetNumber.format(sheetMetricAverage)}</strong><small>{ar ? "من الصفوف الظاهرة" : "From visible rows"}</small></div></article>
        </section>
        <div className="studio-sheet-grid"><table><tbody>{filteredSheetRows.map(({ index: rowIndex, row }) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={`${rowIndex}-${columnIndex}`}><input aria-label={`${ar ? "خلية" : "Cell"} ${rowIndex + 1}-${columnIndex + 1}`} onChange={(event) => update("rows", sheetRows.map((currentRow, currentRowIndex) => currentRowIndex === rowIndex ? currentRow.map((currentCell, currentColumnIndex) => currentColumnIndex === columnIndex ? event.target.value : currentCell) : currentRow))} value={cell} />{cell.startsWith("=") ? <small>{computedSheetRows[rowIndex]?.[columnIndex] ?? "—"}</small> : null}</td>)}</tr>)}</tbody></table></div>
        <section className="studio-sheet-insights"><header><div><strong>{ar ? "الصيغ والمخطط" : "Formulas and chart"}</strong><small>{ar ? "اكتب =SUM(B2:B4) أو أي صيغة مدعومة" : "Enter =SUM(B2:B4) or another supported formula"}</small></div><div><select aria-label={ar ? "عمود المؤشر والمخطط" : "KPI and chart column"} disabled={!numericSheetColumns.length} value={chartColumnIndex >= 0 ? String(chartColumnIndex) : ""} onChange={(event) => setSheetMetricColumn(event.target.value)}>{numericSheetColumns.length ? numericSheetColumns.map((columnIndex) => <option key={columnIndex} value={columnIndex}>{computedSheetRows[0]?.[columnIndex] || `${ar ? "عمود" : "Column"} ${columnIndex + 1}`}</option>) : <option value="">{ar ? "لا يوجد عمود رقمي" : "No numeric column"}</option>}</select><span>{computedSheetRows.flat().filter((cell) => String(cell).startsWith("#")).length ? (ar ? "تحقق من أخطاء الصيغ" : "Review formula errors") : (ar ? "الحسابات سليمة" : "Calculations ready")}</span></div></header>{chartRows.length ? <div className="studio-sheet-chart" aria-label={ar ? "مخطط البيانات" : "Data chart"}>{chartRows.map((item) => <article key={item.label}><span>{item.label}</span><i style={{ "--sheet-bar": `${Math.max(3, Math.abs(item.value) / chartMax * 100)}%` } as React.CSSProperties} /><strong>{sheetNumber.format(item.value)}</strong></article>)}</div> : <p>{ar ? "أضف عموداً رقمياً لعرض المخطط." : "Add a numeric column to render a chart."}</p>}</section>
      </div> : null}

      {kind === "PRESENTATION" ? <>
        <nav className="studio-presentation-themes" aria-label={ar ? "سمات العرض" : "Presentation themes"}>{presentationThemes.map((theme) => <button aria-label={ar ? theme.label[0] : theme.label[1]} className={presentationTheme === theme.id ? "is-active" : ""} key={theme.id} onClick={() => update("theme", theme.id)} style={{ "--theme-background": theme.background, "--theme-surface": theme.surface } as React.CSSProperties} type="button"><i /><span><strong>{ar ? theme.label[0] : theme.label[1]}</strong><small>{ar ? theme.description[0] : theme.description[1]}</small></span></button>)}</nav>
        <section className="studio-presentation-media" aria-label={ar ? "مخططات وصور العرض" : "Presentation charts and images"}>
          <header><div><span>MEDIA</span><strong>{ar ? "المخططات والصور" : "Charts and images"}</strong></div><small>{ar ? "تُحفظ الوسائط مع الشريحة وتُضاف إلى PPTX." : "Media is saved with the slide and embedded in PPTX."}</small></header>
          <label><span>{ar ? "بيانات المخطط" : "Chart data"}</span><input aria-label={ar ? "بيانات مخطط الشريحة" : "Slide chart data"} onChange={(event) => update("slides", presentationSlides.map((slide, index) => index === selectedSlide ? { ...slide, chartData: event.target.value } : slide))} placeholder={ar ? "الربع 1:20, الربع 2:35" : "Q1:20, Q2:35"} value={activeSlide.chartData} /></label>
          <label className="studio-import"><input accept="image/png,image/jpeg,image/webp" onChange={(event) => void importSlideImage(event)} type="file" /><span>{activeSlide.imageName || (ar ? "إضافة صورة" : "Add image")}</span></label>
          <button disabled={!activeSlide.imageData} onClick={() => update("slides", presentationSlides.map((slide, index) => index === selectedSlide ? { ...slide, imageData: "", imageHeight: 0, imageName: "", imageWidth: 0 } : slide))} type="button">{ar ? "إزالة الصورة" : "Remove image"}</button>
        </section>
        <div className="studio-slides-layout">
        <aside>{presentationSlides.map((slide, index) => <button className={selectedSlide === index ? "is-active" : ""} key={index} onClick={() => setSelectedSlide(index)} type="button"><span>{index + 1}</span><strong>{slide.title || (ar ? "شريحة بلا عنوان" : "Untitled slide")}</strong><small>{slide.layout}</small></button>)}<button onClick={() => { update("slides", [...presentationSlides, { title: "", body: "", layout: "title" }]); setSelectedSlide(presentationSlides.length); }} type="button"><Icon name="plus" />{ar ? "إضافة شريحة" : "Add slide"}</button></aside>
        <div className="studio-slide-form"><select aria-label={ar ? "تخطيط الشريحة" : "Slide layout"} value={activeSlide.layout} onChange={(event) => update("slides", presentationSlides.map((slide, index) => index === selectedSlide ? { ...slide, layout: event.target.value } : slide))}><option value="title">{ar ? "عنوان ومحتوى" : "Title and content"}</option><option value="statement">{ar ? "عبارة رئيسية" : "Statement"}</option><option value="split">{ar ? "تقسيم بصري" : "Visual split"}</option></select><label>{ar ? "لون العرض" : "Presentation accent"}<input type="color" value={text(content, "accent") || "#16d9c5"} onChange={(event) => update("accent", event.target.value)} /></label><input aria-label={ar ? "عنوان الشريحة" : "Slide title"} onChange={(event) => update("slides", presentationSlides.map((slide, index) => index === selectedSlide ? { ...slide, title: event.target.value } : slide))} placeholder={ar ? "عنوان الشريحة" : "Slide title"} value={activeSlide.title} /><textarea aria-label={ar ? "محتوى الشريحة" : "Slide content"} onChange={(event) => update("slides", presentationSlides.map((slide, index) => index === selectedSlide ? { ...slide, body: event.target.value } : slide))} placeholder={ar ? "النقاط والمحتوى" : "Points and content"} value={activeSlide.body} /><div><button disabled={selectedSlide === 0} onClick={() => { const next = [...presentationSlides]; [next[selectedSlide - 1], next[selectedSlide]] = [next[selectedSlide]!, next[selectedSlide - 1]!]; update("slides", next); setSelectedSlide(selectedSlide - 1); }} type="button">{ar ? "للأعلى" : "Move up"}</button><button disabled={selectedSlide === presentationSlides.length - 1} onClick={() => { const next = [...presentationSlides]; [next[selectedSlide], next[selectedSlide + 1]] = [next[selectedSlide + 1]!, next[selectedSlide]!]; update("slides", next); setSelectedSlide(selectedSlide + 1); }} type="button">{ar ? "للأسفل" : "Move down"}</button><button onClick={() => { update("slides", [...presentationSlides.slice(0, selectedSlide + 1), { ...activeSlide }, ...presentationSlides.slice(selectedSlide + 1)]); setSelectedSlide(selectedSlide + 1); }} type="button">{ar ? "نسخ" : "Duplicate"}</button><button disabled={presentationSlides.length === 1} onClick={() => { update("slides", presentationSlides.filter((_, index) => index !== selectedSlide)); setSelectedSlide(Math.max(0, selectedSlide - 1)); }} type="button">{ar ? "حذف الشريحة" : "Delete slide"}</button></div></div>
        <article className={`studio-slide studio-slide--${activeSlide.layout} studio-slide--theme-${presentationTheme} studio-print-area`} style={{ "--studio-accent": text(content, "accent") || "#16d9c5" } as React.CSSProperties}><small>{selectedSlide + 1} / {presentationSlides.length}</small><h1>{activeSlide.title || (ar ? "عنوان الشريحة" : "Slide title")}</h1><p>{activeSlide.body || (ar ? "أضف محتوى الشريحة." : "Add slide content.")}</p>{activeSlide.imageData || presentationChart.length ? <div className="studio-slide__media">{activeSlide.imageData ? <Image alt={activeSlide.imageName || ""} height={180} src={activeSlide.imageData} unoptimized width={320} /> : null}{presentationChart.length ? <div className="studio-slide__chart" aria-label={ar ? "معاينة مخطط الشريحة" : "Slide chart preview"}>{presentationChart.map((item) => <span key={item.label}><i style={{ "--slide-chart-value": `${Math.max(4, Math.abs(item.value) / presentationChartMax * 100)}%` } as React.CSSProperties} /><small>{item.label}</small><strong>{item.value.toLocaleString()}</strong></span>)}</div> : null}</div> : null}</article>
      </div></> : null}

      {kind === "LOGO" ? <div className="studio-brand-layout">
        <div className="studio-brand-form"><input aria-label={ar ? "اسم العلامة" : "Brand name"} onChange={(event) => update("name", event.target.value)} placeholder={ar ? "اسم العلامة" : "Brand name"} value={text(content, "name")} /><input aria-label={ar ? "النشاط" : "Industry"} onChange={(event) => update("industry", event.target.value)} placeholder={ar ? "النشاط أو القطاع" : "Industry or sector"} value={text(content, "industry")} /><input aria-label={ar ? "العبارة" : "Tagline"} onChange={(event) => update("tagline", event.target.value)} placeholder={ar ? "العبارة التعريفية" : "Tagline"} value={text(content, "tagline")} /><input aria-label={ar ? "الأحرف" : "Initials"} maxLength={4} onChange={(event) => update("initials", event.target.value.toUpperCase())} placeholder="JP" value={text(content, "initials")} /><label>{ar ? "اللون الأساسي" : "Primary color"}<input onChange={(event) => update("primary", event.target.value)} type="color" value={text(content, "primary") || "#16d9c5"} /></label><label>{ar ? "لون الإبراز" : "Accent color"}<input onChange={(event) => update("accent", event.target.value)} type="color" value={text(content, "accent") || "#f4c86a"} /></label></div>
        <nav className="studio-brand-proposals" aria-label={ar ? "اتجاهات الشعار" : "Logo directions"}>{[["geometric", ar ? "هندسي" : "Geometric"], ["monogram", ar ? "حرفي" : "Monogram"], ["wordmark", ar ? "كتابي" : "Wordmark"]].map(([style, label]) => <button className={text(content, "style") === style ? "is-active" : ""} key={style} onClick={() => update("style", style)} type="button"><span>{style === "wordmark" ? text(content, "name") || "Jenan" : text(content, "initials") || "JP"}</span><strong>{label}</strong><small>{text(content, "industry") || (ar ? "اتجاه مرن" : "Flexible direction")}</small></button>)}</nav>
        <article className={`studio-brand-preview studio-brand-preview--${text(content, "style") || "geometric"}`} style={{ "--studio-primary": text(content, "primary") || "#16d9c5", "--studio-accent": text(content, "accent") || "#f4c86a" } as React.CSSProperties}><div>{text(content, "style") === "wordmark" ? text(content, "name") || "Jenan" : text(content, "initials") || "JP"}</div><h1>{text(content, "name") || (ar ? "اسم العلامة" : "Brand name")}</h1><p>{text(content, "tagline") || text(content, "industry") || (ar ? "معاينة الهوية" : "Brand preview")}</p></article>
      </div> : null}

      {kind === "LETTERHEAD" ? <div className="studio-letterhead-layout">
        <div className="studio-brand-form"><input aria-label={ar ? "اسم الشركة" : "Company name"} onChange={(event) => update("company", event.target.value)} placeholder={ar ? "اسم الشركة" : "Company name"} value={text(content, "company")} /><textarea aria-label={ar ? "العنوان" : "Address"} onChange={(event) => update("address", event.target.value)} placeholder={ar ? "العنوان" : "Address"} value={text(content, "address")} /><input aria-label={ar ? "التواصل" : "Contact"} onChange={(event) => update("contact", event.target.value)} placeholder={ar ? "الهاتف والبريد" : "Phone and email"} value={text(content, "contact")} /><input aria-label={ar ? "التذييل" : "Footer"} onChange={(event) => update("footer", event.target.value)} placeholder={ar ? "نص التذييل" : "Footer text"} value={text(content, "footer")} /><label>{ar ? "مقاس الورق" : "Paper size"}<select value={text(content, "pageSize") || "A4"} onChange={(event) => update("pageSize", event.target.value)}><option value="A4">A4</option><option value="LETTER">US Letter</option></select></label><label>{ar ? "شعار صغير" : "Compact logo"}<input accept="image/png,image/jpeg,image/webp" onChange={importLogo} type="file" /></label><label>{ar ? "لون الهوية" : "Brand color"}<input onChange={(event) => update("accent", event.target.value)} type="color" value={text(content, "accent") || "#16d9c5"} /></label></div>
        <article className={`studio-letterhead studio-letterhead--${(text(content, "pageSize") || "A4").toLowerCase()} studio-print-area`} style={{ "--studio-accent": text(content, "accent") || "#16d9c5" } as React.CSSProperties}><header><div>{text(content, "logoData") ? <Image alt="" height={48} src={text(content, "logoData")} unoptimized width={72} /> : null}<strong>{text(content, "company") || (ar ? "اسم الشركة" : "Company name")}</strong><span>{text(content, "contact")}</span></div><p>{text(content, "address")}</p></header><main><h1>{title || (ar ? "خطاب رسمي" : "Official letter")}</h1></main><footer>{text(content, "footer") || (ar ? "بيانات الشركة" : "Company details")}</footer></article>
      </div> : null}

      {kind === "CV" ? <div className="studio-cv-layout">
        <aside className="studio-cv-templates">
          <header><span>{ar ? "اختيار القالب" : "Choose a template"}</span><small>{ar ? "تغيير القالب لا يحذف بياناتك" : "Templates do not replace your content"}</small></header>
          {[
            ["executive", "#16d9c5", ar ? "عصري فاخر" : "Premium executive"],
            ["modern", "#1f83ff", ar ? "مهني كلاسيكي" : "Professional classic"],
            ["compact", "#2aaf82", ar ? "إبداعي حديث" : "Creative modern"],
            ["executive", "#d7a95f", ar ? "أكاديمي" : "Academic"],
            ["modern", "#7356df", ar ? "بسيط أنيق" : "Simple elegant"],
            ["compact", "#2e94ba", ar ? "تنفيذي مميز" : "Distinct executive"],
          ].map(([template, accent, label], index) => <button className={text(content, "template") === template && text(content, "accent") === accent ? "is-active" : ""} key={`${template}-${accent}`} onClick={() => onChange({ ...content, accent, template })} type="button"><i style={{ "--cv-template-accent": accent } as React.CSSProperties}><span /><span /><span /></i><strong>{label}</strong>{index === 0 ? <small>{ar ? "مقترح" : "Recommended"}</small> : null}</button>)}
        </aside>
        <div className="studio-cv-form"><label>{ar ? "القالب" : "Template"}<select value={text(content, "template") || "executive"} onChange={(event) => update("template", event.target.value)}><option value="executive">{ar ? "تنفيذي" : "Executive"}</option><option value="modern">{ar ? "حديث" : "Modern"}</option><option value="compact">{ar ? "مضغوط" : "Compact"}</option></select></label><label>{ar ? "لون القالب" : "Template accent"}<input type="color" value={text(content, "accent") || "#16d9c5"} onChange={(event) => update("accent", event.target.value)} /></label><input aria-label={ar ? "الاسم" : "Name"} onChange={(event) => update("name", event.target.value)} placeholder={ar ? "الاسم الكامل" : "Full name"} value={text(content, "name")} /><input aria-label={ar ? "المسمى" : "Role"} onChange={(event) => update("role", event.target.value)} placeholder={ar ? "المسمى المهني" : "Professional title"} value={text(content, "role")} /><textarea aria-label={ar ? "النبذة" : "Summary"} onChange={(event) => update("summary", event.target.value)} placeholder={ar ? "نبذة مهنية" : "Professional summary"} value={text(content, "summary")} /><textarea aria-label={ar ? "الخبرة" : "Experience"} onChange={(event) => update("experience", event.target.value)} placeholder={ar ? "الخبرة" : "Experience"} value={text(content, "experience")} /><textarea aria-label={ar ? "التعليم" : "Education"} onChange={(event) => update("education", event.target.value)} placeholder={ar ? "التعليم" : "Education"} value={text(content, "education")} /><input aria-label={ar ? "المهارات" : "Skills"} onChange={(event) => update("skills", event.target.value)} placeholder={ar ? "المهارات، مفصولة بفواصل" : "Skills, separated by commas"} value={text(content, "skills")} /></div>
        <article className={`studio-cv studio-cv--${text(content, "template") || "executive"} studio-print-area`} style={{ "--studio-accent": text(content, "accent") || "#16d9c5" } as React.CSSProperties}><header><h1>{text(content, "name") || (ar ? "الاسم الكامل" : "Full name")}</h1><p>{text(content, "role") || (ar ? "المسمى المهني" : "Professional title")}</p></header><section><h2>{ar ? "الملخص" : "Summary"}</h2><p>{text(content, "summary")}</p></section><section><h2>{ar ? "الخبرة" : "Experience"}</h2><p>{text(content, "experience")}</p></section><section><h2>{ar ? "التعليم" : "Education"}</h2><p>{text(content, "education")}</p></section><section className="studio-cv__skills">{text(content, "skills").split(",").filter(Boolean).map((skill) => <span key={skill}>{skill.trim()}</span>)}</section></article>
      </div> : null}

      {message || exportMessage ? <p className="studio-message" role="status">{exportMessage || message}</p> : null}
    </section>
  );
}