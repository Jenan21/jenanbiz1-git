import { IntakeError, type IntakeLimits, type IntakeMedia } from "./contracts";

export type IntakeDescriptor = { extension: string; mime: string };
export type Budget = { expanded: number; entries: number; cells: number; started: number; now: () => number };
const decoder = new TextDecoder("utf-8", { fatal: true });
export function checkBudget(limits: IntakeLimits, budget: Budget) {
  if (budget.now() - budget.started >= limits.processingMs) throw new IntakeError("PARSER_LIMIT_EXCEEDED");
  if (budget.expanded > limits.expandedBytes || budget.entries > limits.entries) throw new IntakeError("ARCHIVE_LIMIT_EXCEEDED");
}
export function mediaOf(bytes: Uint8Array, descriptor: IntakeDescriptor): IntakeMedia {
  if (!descriptor || typeof descriptor.extension !== "string" || typeof descriptor.mime !== "string" ||
    !/^[a-z0-9]{1,8}$/.test(descriptor.extension) || descriptor.mime.length > 100) throw new IntakeError("MALFORMED_INPUT");
  if (["doc", "xls"].includes(descriptor.extension)) throw new IntakeError("UNSUPPORTED_FILE_TYPE");
  const zip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
  if (descriptor.extension === "zip") {
    if (descriptor.mime !== "application/zip" || !zip) throw new IntakeError("MIME_MISMATCH");
    return "ZIP";
  }
  if (descriptor.extension === "csv") {
    if (descriptor.mime !== "text/csv" || zip || bytes.some((byte) => byte === 0)) throw new IntakeError("MIME_MISMATCH");
    return "CSV";
  }
  // PDF/OOXML/images require a qualified isolated parser, not extension acceptance.
  throw new IntakeError("UNSUPPORTED_FILE_TYPE");
}
export function utf8(bytes: Uint8Array): string {
  try { return decoder.decode(bytes); } catch { throw new IntakeError("MALFORMED_INPUT"); }
}
export function checkParserInput(bytes: Uint8Array, limits: IntakeLimits) {
  // Conservative allocation envelope, not an OS RSS/sandbox guarantee.
  if (bytes.length > limits.parserInputBytes || bytes.length * 8 > limits.parserMemoryBytes) throw new IntakeError("PARSER_LIMIT_EXCEEDED");
}
export function validateCsv(bytes: Uint8Array, limits: IntakeLimits, budget: Budget) {
  checkParserInput(bytes, limits);
  const text = utf8(bytes);
  if (!text.length || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new IntakeError("MALFORMED_INPUT");
  let quoted = false; let closed = false; let atStart = true; let columns = 1; let expected = 0; let rows = 0;
  let rowHasData = false;
  const cell = () => {
    if (++budget.cells > limits.cells) throw new IntakeError("PARSER_LIMIT_EXCEEDED");
    closed = false; atStart = true;
  };
  const row = () => {
    cell();
    if (!expected) expected = columns;
    if (expected !== columns) throw new IntakeError("MALFORMED_INPUT");
    if (++rows > limits.cells) throw new IntakeError("PARSER_LIMIT_EXCEEDED");
    columns = 1; rowHasData = false;
  };
  for (let i = 0; i < text.length; i++) {
    if ((i & 1023) === 0) checkBudget(limits, budget);
    const c = text[i]; rowHasData = true;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') i++;
        else { quoted = false; closed = true; }
      }
      continue;
    }
    if (c === '"') {
      if (!atStart || closed) throw new IntakeError("MALFORMED_INPUT");
      quoted = true; atStart = false;
    } else if (c === ",") { cell(); columns++; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row();
    } else {
      if (closed) throw new IntakeError("MALFORMED_INPUT");
      atStart = false;
    }
  }
  if (quoted) throw new IntakeError("MALFORMED_INPUT");
  if (rowHasData) row();
  if (expected < 2 || rows < 1) throw new IntakeError("MALFORMED_INPUT");
  checkBudget(limits, budget);
}
