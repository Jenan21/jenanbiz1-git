"use client";

import { ChangeEvent, useState } from "react";

import { Icon } from "@/components/ui/icons";
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

function rows(content: Record<string, unknown>) {
  const value = content.rows;
  return Array.isArray(value) ? value.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []) : [];
}

function slides(content: Record<string, unknown>) {
  const value = content.slides;
  if (!Array.isArray(value)) return [{ title: "", body: "" }];
  return value.map((slide) => {
    const record = typeof slide === "object" && slide !== null ? slide as Record<string, unknown> : {};
    return { title: String(record.title ?? ""), body: String(record.body ?? "") };
  });
}

function downloadBlob(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const download = document.createElement("a");
  download.href = url;
  download.download = name;
  download.click();
  URL.revokeObjectURL(url);
}

export function StudioDocumentEditor(props: EditorProps) {
  const { busy, content, currentVersion, kind, locale, message, onChange, onNew, onSave, onTitleChange, title } = props;
  const ar = locale === "ar";
  const [importing, setImporting] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState(0);

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
    context.fillStyle = "#07111f";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = primary;
    context.lineWidth = 14;
    context.strokeRect(54, 54, 522, 522);
    context.fillStyle = primary;
    context.font = "700 210px Alexandria, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text(content, "initials") || "JP", 315, 325);
    context.textAlign = "left";
    context.fillStyle = "#f7fbff";
    context.font = "700 58px Alexandria, sans-serif";
    context.fillText(text(content, "name") || "Brand name", 650, 285);
    context.fillStyle = accent;
    context.font = "400 28px Alexandria, sans-serif";
    context.fillText(text(content, "tagline") || "", 650, 348);
    canvas.toBlob((blob) => blob && downloadBlob(blob, `${title.trim() || "jenan-logo"}.png`, "image/png"), "image/png");
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
  const presentationSlides = slides(content);
  const activeSlide = presentationSlides[Math.min(selectedSlide, presentationSlides.length - 1)] ?? { title: "", body: "" };

  return (
    <section className={`studio-editor studio-editor--${kind.toLowerCase()}`}>
      <header className="studio-editor__toolbar">
        <div><span>{ar ? kindLabels[kind][0] : kindLabels[kind][1]}</span><strong>{currentVersion ? `v${currentVersion}` : (ar ? "غير محفوظ" : "Unsaved")}</strong></div>
        <input aria-label={ar ? "عنوان المشروع" : "Project title"} onChange={(event) => onTitleChange(event.target.value)} placeholder={ar ? "عنوان المشروع" : "Project title"} value={title} />
        <div className="studio-editor__actions">
          <button className="button button--ghost" onClick={onNew} type="button"><Icon name="plus" />{ar ? "جديد" : "New"}</button>
          <button className="button button--primary" disabled={busy || title.trim().length < 2} onClick={onSave} type="button"><Icon name="check" />{busy ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "حفظ إصدار" : "Save version")}</button>
          {kind !== "SHEETS" && kind !== "LOGO" ? <button className="button button--ghost" onClick={() => window.print()} type="button">{ar ? "طباعة / PDF" : "Print / PDF"}</button> : null}
          {kind === "SHEETS" ? <button className="button button--ghost" onClick={exportCsv} type="button">CSV</button> : null}
          {kind === "LOGO" ? <button className="button button--ghost" onClick={exportLogo} type="button">PNG</button> : null}
        </div>
      </header>

      {kind === "DOCS" ? <div className="studio-doc-layout">
        <aside>
          <strong>{ar ? "القوالب" : "Templates"}</strong>
          <button onClick={() => update("body", "")} type="button">{ar ? "مستند فارغ" : "Blank document"}</button>
          <button onClick={() => update("body", ar ? "العنوان\n\nالملخص\n\nالقرار المطلوب" : "Heading\n\nSummary\n\nDecision required")} type="button">{ar ? "مذكرة قرار" : "Decision memo"}</button>
          <label className="studio-import"><input accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={importDocument} type="file" /><span>{importing ? (ar ? "جارٍ الاستخراج..." : "Extracting...") : (ar ? "استيراد DOCX" : "Import DOCX")}</span></label>
        </aside>
        <textarea aria-label={ar ? "محتوى المستند" : "Document content"} onChange={(event) => update("body", event.target.value)} placeholder={ar ? "ابدأ الكتابة هنا..." : "Start writing here..."} value={text(content, "body")} />
        <article className="studio-paper studio-print-area"><h1>{title || (ar ? "مستند بلا عنوان" : "Untitled document")}</h1>{text(content, "body").split("\n").map((line, index) => <p key={index}>{line || "\u00a0"}</p>)}</article>
      </div> : null}

      {kind === "SHEETS" ? <div className="studio-sheet-layout">
        <div className="studio-sheet-tools">
          <label className="studio-import"><input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importDocument} type="file" /><span>{importing ? (ar ? "جارٍ القراءة..." : "Reading...") : (ar ? "استيراد XLSX" : "Import XLSX")}</span></label>
          <button onClick={() => update("rows", [...sheetRows, Array(sheetRows[0]?.length || 4).fill("")])} type="button"><Icon name="plus" />{ar ? "صف" : "Row"}</button>
          <button onClick={() => update("rows", sheetRows.map((row) => [...row, ""]))} type="button"><Icon name="plus" />{ar ? "عمود" : "Column"}</button>
          <span>{sheetRows.length} × {sheetRows[0]?.length ?? 0}</span>
        </div>
        <div className="studio-sheet-grid"><table><tbody>{sheetRows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={`${rowIndex}-${columnIndex}`}><input aria-label={`${ar ? "خلية" : "Cell"} ${rowIndex + 1}-${columnIndex + 1}`} onChange={(event) => update("rows", sheetRows.map((currentRow, currentRowIndex) => currentRowIndex === rowIndex ? currentRow.map((currentCell, currentColumnIndex) => currentColumnIndex === columnIndex ? event.target.value : currentCell) : currentRow))} value={cell} /></td>)}</tr>)}</tbody></table></div>
      </div> : null}

      {kind === "PRESENTATION" ? <div className="studio-slides-layout">
        <aside>{presentationSlides.map((slide, index) => <button className={selectedSlide === index ? "is-active" : ""} key={index} onClick={() => setSelectedSlide(index)} type="button"><span>{index + 1}</span><strong>{slide.title || (ar ? "شريحة بلا عنوان" : "Untitled slide")}</strong></button>)}<button onClick={() => { update("slides", [...presentationSlides, { title: "", body: "" }]); setSelectedSlide(presentationSlides.length); }} type="button"><Icon name="plus" />{ar ? "إضافة شريحة" : "Add slide"}</button></aside>
        <div className="studio-slide-form"><input aria-label={ar ? "عنوان الشريحة" : "Slide title"} onChange={(event) => update("slides", presentationSlides.map((slide, index) => index === selectedSlide ? { ...slide, title: event.target.value } : slide))} placeholder={ar ? "عنوان الشريحة" : "Slide title"} value={activeSlide.title} /><textarea aria-label={ar ? "محتوى الشريحة" : "Slide content"} onChange={(event) => update("slides", presentationSlides.map((slide, index) => index === selectedSlide ? { ...slide, body: event.target.value } : slide))} placeholder={ar ? "النقاط والمحتوى" : "Points and content"} value={activeSlide.body} /><button disabled={presentationSlides.length === 1} onClick={() => { update("slides", presentationSlides.filter((_, index) => index !== selectedSlide)); setSelectedSlide(Math.max(0, selectedSlide - 1)); }} type="button">{ar ? "حذف الشريحة" : "Delete slide"}</button></div>
        <article className="studio-slide studio-print-area"><small>{selectedSlide + 1} / {presentationSlides.length}</small><h1>{activeSlide.title || (ar ? "عنوان الشريحة" : "Slide title")}</h1><p>{activeSlide.body || (ar ? "أضف محتوى الشريحة." : "Add slide content.")}</p></article>
      </div> : null}

      {kind === "LOGO" ? <div className="studio-brand-layout">
        <div className="studio-brand-form"><input aria-label={ar ? "اسم العلامة" : "Brand name"} onChange={(event) => update("name", event.target.value)} placeholder={ar ? "اسم العلامة" : "Brand name"} value={text(content, "name")} /><input aria-label={ar ? "العبارة" : "Tagline"} onChange={(event) => update("tagline", event.target.value)} placeholder={ar ? "العبارة التعريفية" : "Tagline"} value={text(content, "tagline")} /><input aria-label={ar ? "الأحرف" : "Initials"} maxLength={4} onChange={(event) => update("initials", event.target.value.toUpperCase())} placeholder="JP" value={text(content, "initials")} /><label>{ar ? "اللون الأساسي" : "Primary color"}<input onChange={(event) => update("primary", event.target.value)} type="color" value={text(content, "primary") || "#16d9c5"} /></label><label>{ar ? "لون الإبراز" : "Accent color"}<input onChange={(event) => update("accent", event.target.value)} type="color" value={text(content, "accent") || "#f4c86a"} /></label></div>
        <article className="studio-brand-preview" style={{ "--studio-primary": text(content, "primary") || "#16d9c5", "--studio-accent": text(content, "accent") || "#f4c86a" } as React.CSSProperties}><div>{text(content, "initials") || "JP"}</div><h1>{text(content, "name") || (ar ? "اسم العلامة" : "Brand name")}</h1><p>{text(content, "tagline") || (ar ? "معاينة الهوية" : "Brand preview")}</p></article>
      </div> : null}

      {kind === "LETTERHEAD" ? <div className="studio-letterhead-layout">
        <div className="studio-brand-form"><input aria-label={ar ? "اسم الشركة" : "Company name"} onChange={(event) => update("company", event.target.value)} placeholder={ar ? "اسم الشركة" : "Company name"} value={text(content, "company")} /><textarea aria-label={ar ? "العنوان" : "Address"} onChange={(event) => update("address", event.target.value)} placeholder={ar ? "العنوان" : "Address"} value={text(content, "address")} /><input aria-label={ar ? "التواصل" : "Contact"} onChange={(event) => update("contact", event.target.value)} placeholder={ar ? "الهاتف والبريد" : "Phone and email"} value={text(content, "contact")} /><input aria-label={ar ? "التذييل" : "Footer"} onChange={(event) => update("footer", event.target.value)} placeholder={ar ? "نص التذييل" : "Footer text"} value={text(content, "footer")} /><label>{ar ? "لون الهوية" : "Brand color"}<input onChange={(event) => update("accent", event.target.value)} type="color" value={text(content, "accent") || "#16d9c5"} /></label></div>
        <article className="studio-letterhead studio-print-area" style={{ "--studio-accent": text(content, "accent") || "#16d9c5" } as React.CSSProperties}><header><div><strong>{text(content, "company") || (ar ? "اسم الشركة" : "Company name")}</strong><span>{text(content, "contact")}</span></div><p>{text(content, "address")}</p></header><main><h1>{title || (ar ? "خطاب رسمي" : "Official letter")}</h1></main><footer>{text(content, "footer") || (ar ? "بيانات الشركة" : "Company details")}</footer></article>
      </div> : null}

      {kind === "CV" ? <div className="studio-cv-layout">
        <div className="studio-cv-form"><input aria-label={ar ? "الاسم" : "Name"} onChange={(event) => update("name", event.target.value)} placeholder={ar ? "الاسم الكامل" : "Full name"} value={text(content, "name")} /><input aria-label={ar ? "المسمى" : "Role"} onChange={(event) => update("role", event.target.value)} placeholder={ar ? "المسمى المهني" : "Professional title"} value={text(content, "role")} /><textarea aria-label={ar ? "النبذة" : "Summary"} onChange={(event) => update("summary", event.target.value)} placeholder={ar ? "نبذة مهنية" : "Professional summary"} value={text(content, "summary")} /><textarea aria-label={ar ? "الخبرة" : "Experience"} onChange={(event) => update("experience", event.target.value)} placeholder={ar ? "الخبرة" : "Experience"} value={text(content, "experience")} /><textarea aria-label={ar ? "التعليم" : "Education"} onChange={(event) => update("education", event.target.value)} placeholder={ar ? "التعليم" : "Education"} value={text(content, "education")} /><input aria-label={ar ? "المهارات" : "Skills"} onChange={(event) => update("skills", event.target.value)} placeholder={ar ? "المهارات، مفصولة بفواصل" : "Skills, separated by commas"} value={text(content, "skills")} /></div>
        <article className="studio-cv studio-print-area"><header><h1>{text(content, "name") || (ar ? "الاسم الكامل" : "Full name")}</h1><p>{text(content, "role") || (ar ? "المسمى المهني" : "Professional title")}</p></header><section><h2>{ar ? "الملخص" : "Summary"}</h2><p>{text(content, "summary")}</p></section><section><h2>{ar ? "الخبرة" : "Experience"}</h2><p>{text(content, "experience")}</p></section><section><h2>{ar ? "التعليم" : "Education"}</h2><p>{text(content, "education")}</p></section><section className="studio-cv__skills">{text(content, "skills").split(",").filter(Boolean).map((skill) => <span key={skill}>{skill.trim()}</span>)}</section></article>
      </div> : null}

      {message ? <p className="studio-message" role="status">{message}</p> : null}
    </section>
  );
}