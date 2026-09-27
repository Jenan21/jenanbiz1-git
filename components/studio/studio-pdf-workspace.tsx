"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useState } from "react";

import { Icon } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

const pdfTools = [
  ["merge", "دمج PDF", "Merge PDF", true],
  ["split", "تقسيم PDF", "Split PDF", true],
  ["extract", "استخراج الصفحات", "Extract pages", false],
  ["delete", "حذف الصفحات", "Delete pages", false],
  ["reorder", "إعادة الترتيب", "Reorder pages", false],
  ["rotate", "تدوير الصفحات", "Rotate pages", false],
  ["compress", "ضغط PDF", "Compress PDF", false],
  ["convert", "الصور وPDF", "Images and PDF", false],
  ["watermark", "العلامة المائية", "Watermark", false],
  ["numbers", "أرقام الصفحات", "Page numbers", false],
  ["redaction", "تنقيح المحتوى", "Redaction", false],
] as const;

export function StudioPdfWorkspace({ editor, locale }: { editor: boolean; locale: Locale }) {
  const ar = locale === "ar";
  const [pdfs, setPdfs] = useState<File[]>([]);
  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [ranges, setRanges] = useState("");
  const [busy, setBusy] = useState<"merge" | "split" | null>(null);
  const [message, setMessage] = useState("");

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

  if (!editor) {
    return (
      <section className="studio-tool-picker">
        <header><span>JENAN PDF</span><h2>{ar ? "اختر أداة PDF" : "Choose a PDF tool"}</h2><p>{ar ? "المعالجة تتم داخل الجلسة ولا يُحفظ محتوى الملفات." : "Files are processed in-session and their contents are not stored."}</p></header>
        <div className="studio-tool-picker__grid">
          {pdfTools.map(([id, arabic, english, supported]) => supported ? (
            <Link href="/studio/pdf/editor" className="studio-tool-card" key={id}>
              <Icon name="activity" /><strong>{ar ? arabic : english}</strong><small>{ar ? "متاح الآن" : "Available now"}</small><Icon name="arrow" />
            </Link>
          ) : (
            <button className="studio-tool-card is-disabled" disabled key={id} type="button">
              <Icon name="lock" /><strong>{ar ? arabic : english}</strong><small>{ar ? "غير متاح حالياً" : "Not currently available"}</small>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="studio-pdf-editor">
      <div className="studio-pdf-editor__notice"><Icon name="shield" /><div><strong>{ar ? "معالجة خاصة" : "Private processing"}</strong><p>{ar ? "حتى 8 ملفات و10 ميغابايت لكل ملف. لا يُحفظ محتوى PDF في سجل المنصة." : "Up to 8 files and 10 MB per file. PDF contents are not retained in platform history."}</p></div></div>
      <div className="studio-pdf-editor__grid">
        <form onSubmit={merge}>
          <span className="studio-format-badge">PDF + PDF</span>
          <h2>{ar ? "دمج الملفات" : "Merge files"}</h2>
          <p>{ar ? "يُحافظ ترتيب الاختيار على ترتيب الصفحات في الناتج." : "Selection order determines the page order in the output."}</p>
          <label className="studio-file-field"><input accept="application/pdf,.pdf" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => setPdfs(Array.from(event.target.files ?? []))} type="file" /><span>{pdfs.length ? (ar ? `${pdfs.length} ملفات محددة` : `${pdfs.length} files selected`) : (ar ? "اختر ملفات PDF" : "Choose PDF files")}</span></label>
          <button className="button button--primary" disabled={!pdfs.length || busy !== null} type="submit"><Icon name="check" />{busy === "merge" ? (ar ? "جارٍ الدمج..." : "Merging...") : (ar ? "دمج وتنزيل" : "Merge and download")}</button>
        </form>
        <form onSubmit={split}>
          <span className="studio-format-badge">PDF → PDF</span>
          <h2>{ar ? "تقسيم الملف" : "Split a file"}</h2>
          <p>{ar ? "اكتب نطاقات مثل 1-2, 3, 5-7 أو اتركها فارغة لكل صفحة." : "Enter ranges such as 1-2, 3, 5-7, or leave blank for every page."}</p>
          <label className="studio-file-field"><input accept="application/pdf,.pdf" onChange={(event) => setSplitFile(event.target.files?.[0] ?? null)} type="file" /><span>{splitFile?.name ?? (ar ? "اختر ملف PDF" : "Choose a PDF file")}</span></label>
          <input aria-label={ar ? "نطاقات الصفحات" : "Page ranges"} onChange={(event) => setRanges(event.target.value)} placeholder="1-2, 3, 5-7" value={ranges} />
          <button className="button button--primary" disabled={!splitFile || busy !== null} type="submit"><Icon name="check" />{busy === "split" ? (ar ? "جارٍ التقسيم..." : "Splitting...") : (ar ? "تقسيم وتنزيل" : "Split and download")}</button>
        </form>
      </div>
      {message ? <p className="studio-message" role="status">{message}</p> : null}
    </section>
  );
}