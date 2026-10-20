import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { detectDirection, layoutParagraph, type LaidOutLine, type TextDirection } from "@/lib/pdf/bidi-text";
import type { ReportIndicator, ReportModel } from "@/lib/projects/analysis-report";

/** The official paper is a full-page image: the letterhead occupies the top 16% and the contact row the bottom 14%. */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 50;
const TOP = 148;
const BOTTOM = 138;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const INK = rgb(0.09, 0.13, 0.2);
const MUTED = rgb(0.36, 0.42, 0.5);
const NAVY = rgb(0.043, 0.231, 0.549);
const BLUE = rgb(0.12, 0.44, 0.82);
const LINE = rgb(0.79, 0.84, 0.91);
const FILL = rgb(0.94, 0.96, 0.99);
const GOOD = rgb(0.09, 0.51, 0.36);
const WARN = rgb(0.72, 0.47, 0.12);
const BAD = rgb(0.75, 0.22, 0.17);
const AMBER = rgb(0.95, 0.62, 0.15);

type Colour = ReturnType<typeof rgb>;

// Written as plain path.join calls with literal segments so the deployment's file tracing finds both files.
const fontPath = path.join(process.cwd(), "public", "assets", "fonts", "Alexandria-VariableFont_wght.ttf");
const letterheadPath = path.join(process.cwd(), "public", "assets", "letterhead", "jenan-pro-letterhead.jpg");
let assets: Promise<{ font: Buffer; letterhead: Buffer }> | undefined;
function loadAssets() {
  assets ??= Promise.all([readFile(fontPath), readFile(letterheadPath)])
    .then(([font, letterhead]) => ({ font, letterhead }))
    .catch((error) => {
      assets = undefined;
      throw error;
    });
  return assets;
}

type Prepared = { lines: LaidOutLine[]; size: number; lineHeight: number; height: number };
type DrawOptions = { align?: "start" | "end" | "center"; bold?: boolean; colour?: Colour };

class Writer {
  page!: PDFPage;
  y = 0;
  private readonly pages: PDFPage[] = [];

  constructor(
    private readonly pdf: PDFDocument,
    private readonly font: PDFFont,
    private readonly paper: PDFImage,
    /** Layout direction of the page: where blocks start and which side text aligns to. */
    readonly dir: TextDirection,
  ) {
    this.newPage();
  }

  get rtl() {
    return this.dir === "rtl";
  }

  get left() {
    return MARGIN_X;
  }

  get right() {
    return PAGE_W - MARGIN_X;
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.page.drawImage(this.paper, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    this.pages.push(this.page);
    this.y = PAGE_H - TOP;
  }

  ensure(height: number) {
    if (this.y - height < BOTTOM) this.newPage();
  }

  get pageCount() {
    return this.pages.length;
  }

  forEachPage(callback: (page: PDFPage, index: number) => void) {
    this.pages.forEach(callback);
  }

  width(text: string, size: number) {
    return this.font.widthOfTextAtSize(text, size);
  }

  /** Lays out `text` for a box `width` wide; the paragraph's own direction comes from its first letter. */
  prepare(text: string, size: number, width: number, lineGap = 1.55): Prepared {
    const base = detectDirection(text, this.dir);
    const lines = layoutParagraph(text, { base, maxWidth: width, measure: (word) => this.width(word, size), space: this.width(" ", size) });
    const lineHeight = size * lineGap;
    return { lines, size, lineHeight, height: Math.max(1, lines.length) * lineHeight };
  }

  /** Draws a prepared paragraph with its top edge at `top`; returns the height it used. */
  draw(prepared: Prepared, x: number, top: number, width: number, options: DrawOptions = {}, page: PDFPage = this.page) {
    const { align = "start", bold = false, colour = INK } = options;
    const space = this.width(" ", prepared.size);
    prepared.lines.forEach((line, index) => {
      const baseline = top - index * prepared.lineHeight - prepared.size * 1.05;
      const toRight = align === "center" ? "center" : (align === "start") === this.rtl ? "right" : "left";
      let cursor = toRight === "right" ? x + width - line.width : toRight === "center" ? x + (width - line.width) / 2 : x;
      for (const word of line.words) {
        page.drawText(word.text, { x: cursor, y: baseline, size: prepared.size, font: this.font, color: colour });
        if (bold) page.drawText(word.text, { x: cursor + prepared.size * 0.028, y: baseline, size: prepared.size, font: this.font, color: colour });
        cursor += this.width(word.text, prepared.size) + space;
      }
    });
    return prepared.height;
  }

  /** A paragraph that flows down the page and onto the next one when it runs out of room. */
  flow(text: string, size: number, options: DrawOptions & { gap?: number; x?: number; width?: number } = {}) {
    const width = options.width ?? CONTENT_W;
    const x = options.x ?? this.left;
    const prepared = this.prepare(text, size, width);
    for (let index = 0; index < prepared.lines.length; index += 1) {
      this.ensure(prepared.lineHeight);
      this.draw({ ...prepared, lines: [prepared.lines[index]!], height: prepared.lineHeight }, x, this.y, width, options);
      this.y -= prepared.lineHeight;
    }
    this.y -= options.gap ?? 0;
  }

  rect(x: number, top: number, width: number, height: number, options: { fill?: Colour; stroke?: Colour; radius?: number; strokeWidth?: number } = {}) {
    const { fill, stroke, radius = 6, strokeWidth = 0.7 } = options;
    const r = Math.min(radius, width / 2, height / 2);
    const d = `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
    this.page.drawSvgPath(d, { x, y: top, color: fill, borderColor: stroke, borderWidth: stroke ? strokeWidth : 0 });
  }

  hline(y: number, colour: Colour = LINE, x1 = this.left, x2 = this.right, thickness = 0.7) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, color: colour, thickness });
  }

  /** A section title: a short bar on the starting side, the title, and a hairline under it; `keepWith` is the room the first lines of the section need. */
  heading(text: string, keepWith = 90) {
    const prepared = this.prepare(text, 12.5, CONTENT_W);
    this.ensure(prepared.height + 34 + keepWith);
    this.y -= 6;
    const barX = this.rtl ? this.right - 4 : this.left;
    this.page.drawRectangle({ x: barX, y: this.y - 16, width: 4, height: 16, color: BLUE });
    const gutter = 12;
    this.draw(prepared, this.rtl ? this.left : this.left + gutter, this.y - 1, CONTENT_W - gutter, { bold: true, colour: NAVY }, this.page);
    this.y -= prepared.height + 4;
    this.hline(this.y);
    this.y -= 10;
  }
}

const sentimentColour = (item: ReportIndicator): Colour => {
  if (item.state === "UNAVAILABLE") return MUTED;
  const tone = item.tone;
  if (!tone || tone === "UNAVAILABLE") return NAVY;
  if (item.id === "evidence" || item.id === "purchasing") return tone === "HIGH" ? GOOD : tone === "LOW" ? BAD : WARN;
  if (item.id === "risk") return tone === "HIGH" ? BAD : tone === "LOW" ? GOOD : WARN;
  return NAVY;
};

const stateColour = (state: ReportIndicator["state"]): Colour => (state === "VERIFIED" ? GOOD : state === "ESTIMATED" ? WARN : state === "COMPUTED" ? BLUE : MUTED);

/** Where each competitor sits around the place, in kilometres east and north of it. */
function offsetKm(origin: { latitude: number; longitude: number }, point: { latitude: number; longitude: number }) {
  return {
    east: (point.longitude - origin.longitude) * 111.32 * Math.cos((origin.latitude * Math.PI) / 180),
    north: (point.latitude - origin.latitude) * 110.57,
  };
}

/** The report on the official letterhead, as a PDF. The same model that draws the screen draws every figure here. */
export async function renderAnalysisReportPdf(model: ReportModel): Promise<Uint8Array> {
  const ar = model.locale === "ar";
  const copy = (arabic: string, english: string) => (ar ? arabic : english);
  const { font: fontBytes, letterhead } = await loadAssets();

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const paper = await pdf.embedJpg(letterhead);
  pdf.setTitle(model.title);
  pdf.setAuthor("Jenan PRO");
  pdf.setCreator("Jenan PRO");
  pdf.setProducer("Jenan PRO");
  pdf.setLanguage(model.locale);
  if (model.generatedAt && !Number.isNaN(new Date(model.generatedAt).getTime())) pdf.setCreationDate(new Date(model.generatedAt));

  const w = new Writer(pdf, font, paper, ar ? "rtl" : "ltr");

  /* ------------------------------------------------ title */
  const title = w.prepare(model.title, 22, CONTENT_W);
  w.draw(title, w.left, w.y, CONTENT_W, { bold: true, colour: NAVY });
  w.y -= title.height + 2;
  const stamp = w.prepare(`${copy("تاريخ الإصدار", "Issued")}: ${model.generatedAtLabel}`, 9.2, CONTENT_W);
  w.draw(stamp, w.left, w.y, CONTENT_W, { colour: MUTED });
  w.y -= stamp.height + 6;
  w.hline(w.y, BLUE, w.left, w.right, 1.2);
  w.y -= 14;

  if (model.ideaWarning) {
    const warning = w.prepare(model.ideaWarning, 8.8, CONTENT_W - 20);
    w.ensure(warning.height + 18);
    w.rect(w.left, w.y, CONTENT_W, warning.height + 14, { fill: rgb(0.99, 0.93, 0.92), stroke: BAD });
    w.draw(warning, w.left + 10, w.y - 7, CONTENT_W - 20, { colour: BAD });
    w.y -= warning.height + 24;
  }

  /* ------------------------------------------------ facts */
  {
    const [idea, ...rest] = model.facts;
    const pad = 11;
    const inner = CONTENT_W - pad * 2;
    const colGap = 12;
    const colW = (inner - colGap * 2) / 3;
    const ideaValue = w.prepare(idea?.value ?? "", 10.5, inner);
    const ideaLabel = w.prepare(idea?.label ?? "", 7.8, inner);
    const cells = rest.map((fact) => ({ label: w.prepare(fact.label, 7.6, colW), value: w.prepare(fact.value, 9.8, colW) }));
    const rows: typeof cells[] = [];
    for (let index = 0; index < cells.length; index += 3) rows.push(cells.slice(index, index + 3));
    const rowHeights = rows.map((row) => Math.max(...row.map((cell) => cell.label.height + cell.value.height + 3)));
    const total = pad * 2 + ideaLabel.height + ideaValue.height + 6 + rowHeights.reduce((sum, height) => sum + height + 8, 0);
    w.ensure(total + 8);
    const top = w.y;
    w.rect(w.left, top, CONTENT_W, total, { fill: FILL, stroke: LINE });
    let cursor = top - pad;
    w.draw(ideaLabel, w.left + pad, cursor, inner, { colour: MUTED });
    cursor -= ideaLabel.height;
    w.draw(ideaValue, w.left + pad, cursor, inner, { bold: true });
    cursor -= ideaValue.height + 6;
    rows.forEach((row, rowIndex) => {
      row.forEach((cell, column) => {
        const x = w.rtl ? w.right - pad - colW - column * (colW + colGap) : w.left + pad + column * (colW + colGap);
        w.draw(cell.label, x, cursor, colW, { colour: MUTED });
        w.draw(cell.value, x, cursor - cell.label.height - 3, colW, { bold: true });
      });
      cursor -= rowHeights[rowIndex]! + 8;
    });
    w.y = top - total - 14;
  }

  /* ------------------------------------------------ indicators */
  w.heading(copy("المؤشرات الرئيسية", "Key indicators"), 130);
  {
    const gap = 8;
    const cellW = (CONTENT_W - gap * 2) / 3;
    const pad = 9;
    const inner = cellW - pad * 2;
    const prepared = model.indicators.map((item) => {
      const tagW = Math.max(30, w.width(item.stateLabel, 7) + 4);
      return {
        item,
        tagW,
        label: w.prepare(item.label, 8.6, inner - tagW - 6),
        tag: w.prepare(item.stateLabel, 7, tagW),
        value: w.prepare(item.value, 17, inner, 1.3),
        note: w.prepare(item.note, 7.6, inner),
        meta: item.state === "UNAVAILABLE" ? undefined : w.prepare([item.source, item.date, item.confidence ? item.confidenceLabel : ""].filter(Boolean).join(" · "), 6.9, inner),
      };
    });
    for (let start = 0; start < prepared.length; start += 3) {
      const row = prepared.slice(start, start + 3);
      const height = Math.max(...row.map((cell) => pad + Math.max(cell.label.height, 11) + 3 + cell.value.height + 3 + cell.note.height + (cell.meta ? 4 + cell.meta.height : 0) + pad));
      w.ensure(height + 8);
      const top = w.y;
      row.forEach((cell, column) => {
        const x = w.rtl ? w.right - cellW - column * (cellW + gap) : w.left + column * (cellW + gap);
        w.rect(x, top, cellW, height, { fill: rgb(1, 1, 1), stroke: LINE, radius: 7 });
        w.page.drawRectangle({ x, y: top - 2.2, width: cellW, height: 2.2, color: stateColour(cell.item.state), opacity: 0.85 });
        let cursor = top - pad;
        w.draw(cell.label, x + pad, cursor, inner, { colour: MUTED });
        w.draw(cell.tag, x + pad, cursor, inner, { align: "end", bold: true, colour: stateColour(cell.item.state) });
        cursor -= Math.max(cell.label.height, 11) + 3;
        w.draw(cell.value, x + pad, cursor, inner, { bold: true, colour: sentimentColour(cell.item) });
        cursor -= cell.value.height + 3;
        w.draw(cell.note, x + pad, cursor, inner, { colour: MUTED });
        cursor -= cell.note.height + 4;
        if (cell.meta) w.draw(cell.meta, x + pad, cursor, inner, { colour: MUTED });
      });
      w.y = top - height - gap;
    }
    const pendingText = `${copy("غير متاحة حاليًا", "Not available yet")}: ${model.pending.map((item) => `${item.label} (${item.reason})`).join(copy("، ", ", "))}`;
    const pending = w.prepare(pendingText, 7.8, CONTENT_W);
    w.ensure(pending.height + 8);
    w.draw(pending, w.left, w.y, CONTENT_W, { colour: MUTED });
    w.y -= pending.height + 12;

    const disclaimer = w.prepare(model.disclaimer, 7.6, CONTENT_W - 20);
    w.ensure(disclaimer.height + 22);
    w.rect(w.left, w.y, CONTENT_W, disclaimer.height + 14, { fill: FILL, stroke: LINE });
    w.draw(disclaimer, w.left + 10, w.y - 7, CONTENT_W - 20, { colour: MUTED });
    w.y -= disclaimer.height + 24;
  }

  /* ------------------------------------------------ location */
  w.heading(copy("تحليل الموقع الجغرافي", "Geographic location analysis"), 210);
  {
    const radius = 70;
    const chartW = radius * 2 + 28;
    const textW = CONTENT_W - chartW - 16;
    const place = w.prepare(model.place.name, 10.5, textW);
    const coords = w.prepare(model.place.coordinates, 8.4, textW);
    const nearby = model.standOut.competitors;
    const within = (from: number, to: number) => nearby.filter((item) => item.km !== null && item.km >= from && item.km < to).length;
    const counted = nearby.length > 0 || model.indicators.find((item) => item.id === "competitors")?.state !== "UNAVAILABLE";
    const lines = counted
      ? [
          `${copy("ضمن 1 كم", "Within 1 km")}: ${within(0, 1)}`,
          `${copy("من 1 إلى 3 كم", "1 to 3 km")}: ${within(1, 3)}`,
          `${copy("من 3 إلى 5 كم", "3 to 5 km")}: ${within(3, 5.0001)}`,
          `${copy("المجموع المرصود", "Total mapped")}: ${nearby.length}`,
        ].map((text) => w.prepare(text, 9, textW))
      : [w.prepare(model.standOut.empty, 9, textW)];
    const caption = w.prepare(copy("رسم تخطيطي لتوزيع المنافسين المرصودين حول الموقع وليس خريطة. الشمال في الأعلى.", "A schematic of the mapped competitors around the place, not a map. North is up."), 7.2, CONTENT_W);
    const textHeight = place.height + coords.height + 10 + lines.reduce((sum, line) => sum + line.height + 2, 0) + 18;
    const blockH = Math.max(radius * 2 + 22, textHeight);
    w.ensure(blockH + caption.height + 14);
    const top = w.y;
    const chartX = w.rtl ? w.left : w.right - chartW;
    const textX = w.rtl ? w.right - textW : w.left;
    const cx = chartX + chartW / 2;
    const cy = top - blockH / 2;
    for (const km of [5, 3, 1]) {
      w.page.drawCircle({ x: cx, y: cy, size: (km / 5) * radius, borderColor: LINE, borderWidth: 0.8, color: km === 5 ? FILL : undefined, opacity: 1 });
    }
    w.page.drawLine({ start: { x: cx - radius, y: cy }, end: { x: cx + radius, y: cy }, color: LINE, thickness: 0.5 });
    w.page.drawLine({ start: { x: cx, y: cy - radius }, end: { x: cx, y: cy + radius }, color: LINE, thickness: 0.5 });
    w.draw(w.prepare("N", 7, 12), cx - 6, cy + radius + 11, 12, { align: "center", bold: true, colour: NAVY });
    if (model.place.latitude !== undefined && model.place.longitude !== undefined) {
      const origin = { latitude: model.place.latitude, longitude: model.place.longitude };
      for (const item of model.mapCompetitors) {
        const { east, north } = offsetKm(origin, item);
        if (Math.hypot(east, north) > 5) continue;
        w.page.drawCircle({ x: cx + (east / 5) * radius, y: cy + (north / 5) * radius, size: 2.4, color: AMBER, borderColor: rgb(1, 1, 1), borderWidth: 0.5 });
      }
    }
    w.page.drawCircle({ x: cx, y: cy, size: 4.4, color: NAVY, borderColor: rgb(1, 1, 1), borderWidth: 1 });
    // The ring names sit on small white tags drawn last, so a competitor dot never hides one.
    for (const [km, label] of [[5, copy("5 كم", "5 km")], [3, copy("3 كم", "3 km")], [1, copy("1 كم", "1 km")]] as const) {
      const r = (km / 5) * radius;
      const labelW = w.width(label, 6.4) + 4;
      const lx = cx + r * 0.7071 + 2;
      const ly = cy + r * 0.7071 + 2;
      w.page.drawRectangle({ x: lx - 1, y: ly - 1.5, width: labelW, height: 9, color: rgb(1, 1, 1), opacity: 0.9 });
      w.draw(w.prepare(label, 6.4, labelW), lx - 1, ly + 7.5, labelW, { align: "center", colour: MUTED });
    }
    let cursor = top - 4;
    cursor -= w.draw(place, textX, cursor, textW, { bold: true, colour: NAVY });
    cursor -= w.draw(coords, textX, cursor, textW, { colour: MUTED }) + 8;
    for (const line of lines) cursor -= w.draw(line, textX, cursor, textW) + 2;
    w.y = top - blockH - 4;
    w.draw(caption, w.left, w.y, CONTENT_W, { colour: MUTED });
    w.y -= caption.height + 12;
  }

  /* ------------------------------------------------ recommendations */
  w.heading(copy("التوصيات", "Recommendations"));
  if (model.recommendations.length) {
    const textW = CONTENT_W - 26;
    model.recommendations.forEach((item, index) => {
      const heading = w.prepare(item.title, 10.2, textW);
      const text = w.prepare(item.text, 8.8, textW);
      const basisText = item.basis.length ? ` — ${copy("تعتمد على", "Based on")}: ${item.basis.join(copy("، ", ", "))}` : "";
      const why = w.prepare(`${copy("لماذا؟", "Why?")} ${item.reason}${basisText}`, 8.3, textW);
      const height = heading.height + text.height + why.height + 9;
      w.ensure(height);
      const top = w.y;
      const badgeX = w.rtl ? w.right - 9 : w.left + 9;
      w.page.drawCircle({ x: badgeX, y: top - 9, size: 8.5, color: NAVY });
      w.draw(w.prepare(String(index + 1), 8.5, 14), badgeX - 7, top - 4.6, 14, { align: "center", bold: true, colour: rgb(1, 1, 1) });
      const x = w.rtl ? w.left : w.left + 26;
      let cursor = top;
      cursor -= w.draw(heading, x, cursor, textW, { bold: true, colour: INK });
      cursor -= w.draw(text, x, cursor, textW, { colour: INK });
      w.draw(why, x, cursor, textW, { colour: MUTED });
      w.y = top - height;
    });
  } else {
    w.flow(model.standOut.empty, 9, { colour: MUTED, gap: 8 });
  }

  /* ------------------------------------------------ stand out */
  w.heading(copy("كيف تتميز عن منافسيك؟", "How to stand out from competitors?"));
  if (model.standOut.positioning) {
    const positioning = w.prepare(model.standOut.positioning, 9, CONTENT_W - 20);
    w.ensure(positioning.height + 22);
    w.rect(w.left, w.y, CONTENT_W, positioning.height + 14, { fill: FILL, stroke: LINE });
    w.draw(positioning, w.left + 10, w.y - 7, CONTENT_W - 20, {});
    w.y -= positioning.height + 24;
  }
  if (model.standOut.competitors.length) {
    const cols = [CONTENT_W * 0.5, CONTENT_W * 0.3, CONTENT_W * 0.2];
    const headers = [copy("المنشأة", "Venue"), copy("النشاط", "Type"), copy("المسافة", "Distance")];
    const rowAt = (cells: string[], bold: boolean, colour: Colour) => {
      const prepared = cells.map((cell, index) => w.prepare(cell, 8.4, cols[index]! - 8));
      const height = Math.max(...prepared.map((cell) => cell.height)) + 6;
      w.ensure(height + 2);
      let offset = 0;
      prepared.forEach((cell, index) => {
        const x = w.rtl ? w.right - offset - cols[index]! + 4 : w.left + offset + 4;
        w.draw(cell, x, w.y - 3, cols[index]! - 8, { bold, colour });
        offset += cols[index]!;
      });
      w.y -= height;
      w.hline(w.y);
    };
    rowAt(headers, true, MUTED);
    for (const item of model.standOut.competitors.slice(0, 8)) rowAt([item.name, item.category, item.distance], false, INK);
    if (model.standOut.competitors.length > 8) {
      w.y -= 4;
      w.flow(copy(`يظهر أقرب 8 من أصل ${model.standOut.competitors.length} منشأة مرصودة.`, `Showing the nearest 8 of ${model.standOut.competitors.length} mapped venues.`), 7.8, { colour: MUTED });
    }
    w.y -= 8;
  } else if (!model.standOut.positioning) {
    w.flow(model.standOut.empty, 9, { colour: MUTED, gap: 8 });
  }

  /* ------------------------------------------------ risks */
  w.heading(copy("المخاطر والتحديات", "Risks and challenges"));
  {
    const colour = model.risks.level === "HIGH" ? BAD : model.risks.level === "MODERATE" ? WARN : model.risks.level === "LOW" ? GOOD : MUTED;
    w.flow(`${copy("مستوى مخاطر البيانات", "Data-risk level")}: ${model.risks.levelLabel}`, 9.6, { bold: true, colour, gap: 4 });
    if (model.risks.items.length) {
      const textW = CONTENT_W - 16;
      for (const item of model.risks.items) {
        const text = w.prepare(item, 8.8, textW);
        w.ensure(text.height + 4);
        const top = w.y;
        w.page.drawCircle({ x: w.rtl ? w.right - 3 : w.left + 3, y: top - 6, size: 2, color: WARN });
        w.draw(text, w.rtl ? w.left : w.left + 16, top, textW, {});
        w.y = top - text.height - 4;
      }
    } else {
      w.flow(model.risks.empty, 8.8, { colour: MUTED });
    }
    w.y -= 8;
  }

  /* ------------------------------------------------ sources */
  w.heading(copy("المصادر ودرجة الثقة", "Sources and confidence"), 70);
  if (model.sources.length) {
    const cols = [CONTENT_W * 0.3, CONTENT_W * 0.36, CONTENT_W * 0.22, CONTENT_W * 0.12];
    const headers = [copy("المصدر", "Source"), copy("ما يغطيه", "What it covers"), copy("تاريخ الجلب", "Retrieved"), copy("الثقة", "Confidence")];
    const rowAt = (cells: string[], bold: boolean, colour: Colour) => {
      const prepared = cells.map((cell, index) => w.prepare(cell, 7.8, cols[index]! - 8));
      const height = Math.max(...prepared.map((cell) => cell.height)) + 6;
      w.ensure(height + 2);
      let offset = 0;
      prepared.forEach((cell, index) => {
        const x = w.rtl ? w.right - offset - cols[index]! + 4 : w.left + offset + 4;
        w.draw(cell, x, w.y - 3, cols[index]! - 8, { bold, colour });
        offset += cols[index]!;
      });
      w.y -= height;
      w.hline(w.y);
    };
    rowAt(headers, true, MUTED);
    for (const row of model.sources) rowAt([row.name, row.covers, row.date, row.confidence], false, INK);
  } else {
    w.flow(model.standOut.empty, 9, { colour: MUTED });
  }

  /* ------------------------------------------------ page numbers */
  const total = w.pageCount;
  w.forEachPage((page, index) => {
    const label = copy(`صفحة ${index + 1} من ${total}`, `Page ${index + 1} of ${total}`);
    const prepared = w.prepare(label, 7.6, 120);
    w.draw(prepared, PAGE_W / 2 - 60, 131, 120, { align: "center", colour: MUTED }, page);
  });

  return pdf.save();
}
