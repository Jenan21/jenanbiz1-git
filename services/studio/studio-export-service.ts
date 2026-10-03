import { AlignmentType, Document, Footer, Header, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";

import { Prisma, StudioDocumentKind } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type ExportKind = Extract<StudioDocumentKind, "DOCS" | "LETTERHEAD" | "PRESENTATION" | "SHEETS">;

function text(content: Record<string, unknown>, key: string) {
  return typeof content[key] === "string" ? content[key] as string : "";
}

function rows(content: Record<string, unknown>) {
  return Array.isArray(content.rows) ? content.rows.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []) : [];
}

function slides(content: Record<string, unknown>) {
  if (!Array.isArray(content.slides)) return [];
  return content.slides.map((slide) => {
    const record = slide && typeof slide === "object" && !Array.isArray(slide) ? slide as Record<string, unknown> : {};
    return { body: String(record.body ?? ""), chartData: String(record.chartData ?? ""), imageData: String(record.imageData ?? ""), imageHeight: Number(record.imageHeight) || 0, imageWidth: Number(record.imageWidth) || 0, layout: String(record.layout ?? "title"), title: String(record.title ?? "") };
  });
}

function chartPoints(value: string) {
  return value.split(/[\n,]+/).map((entry) => {
    const separator = entry.lastIndexOf(":");
    if (separator < 1) return null;
    const label = entry.slice(0, separator).trim();
    const amount = Number(entry.slice(separator + 1).trim());
    return label && Number.isFinite(amount) ? { label, value: amount } : null;
  }).filter((item): item is { label: string; value: number } => item !== null).slice(0, 8);
}

async function createDocs(title: string, content: Record<string, unknown>) {
  const body = text(content, "body").split(/\r?\n/);
  const children: Array<Paragraph | Table> = [new Paragraph({ heading: HeadingLevel.TITLE, text: title })];
  const imageMatch = text(content, "imageData").match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (imageMatch) {
    const sourceWidth = Number(content.imageWidth) || 16;
    const sourceHeight = Number(content.imageHeight) || 9;
    const scale = Math.min(520 / sourceWidth, 300 / sourceHeight);
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: Buffer.from(imageMatch[2], "base64"), transformation: { height: Math.max(1, Math.round(sourceHeight * scale)), width: Math.max(1, Math.round(sourceWidth * scale)) }, type: imageMatch[1] === "png" ? "png" : "jpg" })], spacing: { after: 180 } }));
  }
  for (let index = 0; index < body.length;) {
    const line = body[index];
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (index < body.length && body[index].trim().startsWith("|")) tableLines.push(body[index++]);
      children.push(new Table({ rows: tableLines.map((tableLine) => new TableRow({ children: tableLine.split("|").slice(1, -1).map((cell) => new TableCell({ children: [new Paragraph(cell.trim() || " ")] })) })), width: { size: 100, type: WidthType.PERCENTAGE } }));
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    children.push(heading ? new Paragraph({ heading: heading[1].length === 1 ? HeadingLevel.HEADING_1 : heading[1].length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, text: heading[2] }) : new Paragraph({ children: [new TextRun(line.startsWith("- ") ? `• ${line.slice(2)}` : line || " ")], spacing: { after: line ? 120 : 60 } }));
    index += 1;
  }
  const letter = text(content, "pageSize") === "LETTER";
  const document = new Document({ sections: [{ properties: { page: { size: { height: letter ? 15_840 : 16_838, width: letter ? 12_240 : 11_906 } } }, headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, text: text(content, "header") || "Jenan PRO Docs" })] }) }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, text: text(content, "footer") || "Jenan PRO" })] }) }, children }] });
  return { bytes: await Packer.toBuffer(document), extension: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
}

async function createLetterhead(title: string, content: Record<string, unknown>) {
  const company = text(content, "company") || title;
  const letter = text(content, "pageSize") === "LETTER";
  const document = new Document({
    sections: [{
      properties: { page: { size: { height: letter ? 15_840 : 16_838, width: letter ? 12_240 : 11_906 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ bold: true, size: 34, text: company })] }), new Paragraph(text(content, "contact")), new Paragraph(text(content, "address"))] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, text: text(content, "footer") || company })] }) },
      children: [new Paragraph({ heading: HeadingLevel.TITLE, text: title }), new Paragraph({ children: [new TextRun(" ")], spacing: { after: 720 } })],
    }],
  });
  return { bytes: await Packer.toBuffer(document), extension: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
}

async function createSheets(title: string, content: Record<string, unknown>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Jenan PRO Studio";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(title.slice(0, 31) || "Jenan Sheet", { views: [{ state: "frozen", ySplit: 1 }] });
  for (const [rowIndex, values] of rows(content).entries()) {
    const row = sheet.addRow(values.map((value) => value.startsWith("=") ? { formula: value.slice(1) } : value));
    if (rowIndex === 0) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF087E8B" } }; }
  }
  sheet.columns.forEach((column) => { column.width = Math.min(48, Math.max(12, ...((column.values ?? []).map((value) => String(value ?? "").length + 2)))); });
  return { bytes: Buffer.from(await workbook.xlsx.writeBuffer()), extension: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}

async function createPresentation(title: string, content: Record<string, unknown>) {
  const themes = {
    midnight: { background: "06111F", title: "F4FBFF", body: "B8CBD5", footer: "5F8797" },
    paper: { background: "F5F1E8", title: "102A30", body: "405A61", footer: "6E7A79" },
    signal: { background: "17191E", title: "FDF8E7", body: "D7D9D9", footer: "8A8F94" },
  } as const;
  const presentation = new PptxGenJS();
  presentation.layout = "LAYOUT_WIDE";
  presentation.author = "Jenan PRO Studio";
  presentation.subject = title;
  presentation.title = title;
  presentation.company = "Jenan PRO";
  presentation.theme = { headFontFace: "Arial", bodyFontFace: "Arial" };
  const items = slides(content);
  const accent = text(content, "accent").replace("#", "") || "19D9D0";
  const themeId = text(content, "theme") as keyof typeof themes;
  const theme = themes[themeId] ?? themes.midnight;
  for (const [index, item] of items.entries()) {
    const slide = presentation.addSlide();
    slide.background = { color: theme.background };
    slide.addShape(presentation.ShapeType.line, { x: 0.65, y: 0.72, w: 1.2, h: 0, line: { color: accent, width: 3 } });
    if (item.layout === "statement") {
      slide.addText(item.title || `${title} ${index + 1}`, { x: 1, y: 1.65, w: 11.3, h: 1.7, color: theme.title, fontFace: "Arial", fontSize: 38, bold: true, align: "center", margin: 0.04, rtlMode: true, valign: "middle" });
      slide.addText(item.body || "", { x: 2, y: 3.75, w: 9.3, h: 1.3, color: accent, fontFace: "Arial", fontSize: 20, align: "center", margin: 0.04, rtlMode: true });
    } else if (item.layout === "split") {
      slide.addShape(presentation.ShapeType.rect, { x: 0, y: 0, w: 4.2, h: 7.5, fill: { color: accent, transparency: 82 }, line: { transparency: 100 } });
      slide.addText(item.title || `${title} ${index + 1}`, { x: 0.7, y: 2.2, w: 3, h: 1.4, color: theme.title, fontFace: "Arial", fontSize: 28, bold: true, margin: 0.04, rtlMode: true, valign: "middle" });
      slide.addText(item.body || "", { x: 4.8, y: 1.5, w: 7.7, h: 4.5, color: theme.body, fontFace: "Arial", fontSize: 19, margin: 0.08, rtlMode: true, valign: "middle" });
    } else {
      slide.addText(item.title || `${title} ${index + 1}`, { x: 0.65, y: 0.95, w: 11.9, h: 0.75, color: theme.title, fontFace: "Arial", fontSize: 28, bold: true, margin: 0, rtlMode: true });
      slide.addText(item.body || "", { x: 0.72, y: 2, w: 11.2, h: 4.2, color: theme.body, fontFace: "Arial", fontSize: 18, breakLine: false, margin: 0.08, valign: "middle", rtlMode: true });
    }
    const points = chartPoints(item.chartData);
    if (points.length) slide.addChart(presentation.ChartType.bar, [{ name: "Data", labels: points.map((point) => point.label), values: points.map((point) => point.value) }], { x: 0.75, y: 4.85, w: item.imageData ? 5.7 : 8.2, h: 1.65, chartColors: [accent], showLegend: false, showTitle: false, showValue: true });
    if (/^data:image\/(?:png|jpeg);base64,/.test(item.imageData)) {
      const sourceWidth = item.imageWidth || 16;
      const sourceHeight = item.imageHeight || 9;
      const scale = Math.min(3.45 / sourceWidth, 1.95 / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      slide.addImage({ data: item.imageData, x: 9.05 + (3.45 - width) / 2, y: 4.45 + (1.95 - height) / 2, w: width, h: height, transparency: 0 });
    }
    slide.addText(`Jenan PRO · ${index + 1}/${Math.max(items.length, 1)}`, { x: 0.72, y: 7, w: 11.2, h: 0.2, color: theme.footer, fontFace: "Arial", fontSize: 8, margin: 0 });
  }
  if (!items.length) presentation.addSlide().addText(title, { x: 1, y: 2.6, w: 11.3, h: 1, color: "F4FBFF", fontFace: "Arial", fontSize: 30, bold: true, align: "center" });
  const output = await presentation.write({ outputType: "nodebuffer" });
  return { bytes: Buffer.from(output as Uint8Array), extension: "pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
}

export async function generateStudioExport(input: { content: Record<string, unknown>; kind: ExportKind; title: string }) {
  const serialized = JSON.stringify(input.content);
  if (input.title.trim().length < 2 || input.title.trim().length > 160 || serialized.length > 150_000) throw new Error("Studio export input is invalid");
  return input.kind === StudioDocumentKind.DOCS
    ? await createDocs(input.title.trim(), input.content)
    : input.kind === StudioDocumentKind.LETTERHEAD
      ? await createLetterhead(input.title.trim(), input.content)
      : input.kind === StudioDocumentKind.SHEETS
        ? await createSheets(input.title.trim(), input.content)
        : await createPresentation(input.title.trim(), input.content);
}

export async function exportStudioDocument(input: { content: Record<string, unknown>; kind: ExportKind; title: string }, userId: string) {
  const exported = await generateStudioExport(input);
  await db.auditLog.create({ data: { actorId: userId, action: "studio.document.exported", entityType: "StudioExport", metadata: { extension: exported.extension, kind: input.kind, sizeBytes: exported.bytes.byteLength, title: input.title.trim() } as Prisma.InputJsonValue } });
  return exported;
}