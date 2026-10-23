import { IntakeError, type IntakeLimits } from "./contracts";
import { checkBudget, checkParserInput, mediaOf, utf8, validateCsv, type Budget } from "./formats";

type Entry = { name: string; bytes: Uint8Array; };
function u16(b: Uint8Array, n: number) { return b[n] | b[n + 1] << 8; }
function u32(b: Uint8Array, n: number) { return (u16(b, n) | u16(b, n + 2) << 16) >>> 0; }
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pathKey(name: string): string {
  // Deliberately narrow portable grammar: reject ambiguity rather than normalize RAW names.
  if (!name || name.length > 240 || !/^[A-Za-z0-9_./-]+$/.test(name) ||
    name.startsWith("/") || name.includes("\\") || name.endsWith("/") ||
    name.split("/").some((part) => !part || part === "." || part === ".." || part.endsWith(".") ||
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(part))) throw new IntakeError("MALFORMED_INPUT");
  return name.toLowerCase();
}
function parseStoredZip(bytes: Uint8Array, limits: IntakeLimits, budget: Budget): Entry[] {
  checkParserInput(bytes, limits);
  if (bytes.length < 22) throw new IntakeError("MALFORMED_INPUT");
  const end = bytes.length - 22;
  if (u32(bytes, end) !== 0x06054b50 || u16(bytes, end + 4) || u16(bytes, end + 6) ||
    u16(bytes, end + 8) !== u16(bytes, end + 10) || u16(bytes, end + 20)) throw new IntakeError("MALFORMED_INPUT");
  const count = u16(bytes, end + 10); const centralSize = u32(bytes, end + 12); const start = u32(bytes, end + 16);
  if (!count || count === 0xffff || start + centralSize !== end) throw new IntakeError("MALFORMED_INPUT");
  if (budget.entries + count > limits.entries) throw new IntakeError("ARCHIVE_LIMIT_EXCEEDED");
  const entries: Entry[] = []; const seen = new Set<string>(); let at = start; let localAt = 0;
  for (let n = 0; n < count; n++) {
    checkBudget(limits, budget);
    if (at + 46 > end || u32(bytes, at) !== 0x02014b50) throw new IntakeError("MALFORMED_INPUT");
    const flags = u16(bytes, at + 8); const method = u16(bytes, at + 10);
    const compressed = u32(bytes, at + 20); const expanded = u32(bytes, at + 24);
    const nameLen = u16(bytes, at + 28); const extraLen = u16(bytes, at + 30); const commentLen = u16(bytes, at + 32);
    const offset = u32(bytes, at + 42); const mode = u32(bytes, at + 38) >>> 16;
    if (flags & 1 || flags & 0x40) throw new IntakeError("PASSWORD_PROTECTED");
    if (expanded > limits.individualBytes || budget.expanded + expanded > limits.expandedBytes ||
      expanded > Math.max(1, compressed) * limits.expansionRatio) throw new IntakeError("ARCHIVE_LIMIT_EXCEEDED");
    // No deflate, descriptors, extra fields (including links/ZIP64), comments, encryption or non-regular entries.
    if (method !== 0) throw new IntakeError("UNSUPPORTED_FILE_TYPE");
    if (u16(bytes, at + 6) > 20 || flags !== 0 && flags !== 0x800 || extraLen || commentLen || u16(bytes, at + 34) ||
      (u32(bytes, at + 38) & 0x18) || mode !== 0 && (mode & 0xf000) !== 0x8000) throw new IntakeError("MALFORMED_INPUT");
    if (!expanded || expanded !== compressed || offset !== localAt || at + 46 + nameLen > end ||
      offset + 30 > start || u32(bytes, offset) !== 0x04034b50) throw new IntakeError("MALFORMED_INPUT");
    const nameBytes = bytes.subarray(at + 46, at + 46 + nameLen); const name = utf8(nameBytes); const key = pathKey(name);
    if (seen.has(key) || [...seen].some((old) => old.startsWith(`${key}/`) || key.startsWith(`${old}/`))) throw new IntakeError("DUPLICATE_ARTIFACT");
    seen.add(key);
    const localNameLen = u16(bytes, offset + 26);
    if (u16(bytes, offset + 4) !== u16(bytes, at + 6) || u16(bytes, offset + 6) !== flags || u16(bytes, offset + 8) !== method ||
      u32(bytes, offset + 14) !== u32(bytes, at + 16) || u32(bytes, offset + 18) !== compressed ||
      u32(bytes, offset + 22) !== expanded || localNameLen !== nameLen || u16(bytes, offset + 28)) throw new IntakeError("MALFORMED_INPUT");
    const dataStart = offset + 30 + nameLen; const dataEnd = dataStart + compressed;
    if (dataEnd > start || !nameBytes.every((byte, i) => byte === bytes[offset + 30 + i])) throw new IntakeError("MALFORMED_INPUT");
    const data = bytes.subarray(dataStart, dataEnd);
    if (crc32(data) !== u32(bytes, at + 16)) throw new IntakeError("MALFORMED_INPUT");
    budget.expanded += expanded; budget.entries++;
    entries.push({ name, bytes: data }); localAt = dataEnd; at += 46 + nameLen;
  }
  if (at !== end || localAt !== start) throw new IntakeError("MALFORMED_INPUT");
  return entries;
}
export type ExtractedRaw = { bytes: Uint8Array; media: "CSV"; taint: "RAW_TAINTED" };
export function extractRaw(bytes: Uint8Array, media: "CSV" | "ZIP", limits: IntakeLimits, now: () => number): ExtractedRaw[] {
  const budget: Budget = { entries: 0, expanded: 0, cells: 0, started: now(), now };
  const output: ExtractedRaw[] = [];
  function visit(content: Uint8Array, kind: "CSV" | "ZIP", depth: number) {
    checkBudget(limits, budget);
    if (kind === "CSV") {
      validateCsv(content, limits, budget); output.push({ bytes: content, media: "CSV", taint: "RAW_TAINTED" }); return;
    }
    if (depth > limits.depth) throw new IntakeError("ARCHIVE_LIMIT_EXCEEDED");
    for (const entry of parseStoredZip(content, limits, budget)) {
      const extension = entry.name.slice(entry.name.lastIndexOf(".") + 1).toLowerCase();
      const kind = mediaOf(entry.bytes, { extension, mime: extension === "csv" ? "text/csv" : "application/zip" });
      visit(entry.bytes, kind, depth + 1);
    }
  }
  if (media === "CSV") { budget.entries = 1; budget.expanded = bytes.length; }
  visit(bytes, media, 1);
  checkBudget(limits, budget);
  if (budget.expanded > bytes.length * limits.expansionRatio) throw new IntakeError("ARCHIVE_LIMIT_EXCEEDED");
  return output;
}
