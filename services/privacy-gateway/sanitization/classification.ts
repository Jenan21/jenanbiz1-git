import { initialIntakeLimits } from "../intake/contracts";
import { utf8, validateCsv } from "../intake/formats";
import { privacyHash } from "../policy";
import {
  analyticalKinds, profile, SanitizationError, type AnalyticalKind, type FieldClass, type SensitiveKind,
} from "./contracts";

const sensitiveHeaders: Readonly<Record<string, SensitiveKind>> = Object.freeze({
  person_name: "PERSON", owner_name: "OWNER", delegate_name: "DELEGATE", signatory_name: "SIGNATORY",
  national_id: "NATIONAL_ID", iqama: "NATIONAL_ID", phone: "PHONE", email: "EMAIL", iban: "IBAN",
  bank_account: "BANK_ACCOUNT", payment_card: "PAYMENT_CARD", signature: "SIGNATURE", stamp: "STAMP",
  qr_payload: "QR", barcode_payload: "BARCODE", exact_address: "ADDRESS", account_id: "ACCOUNT_ID",
  user_id: "ACCOUNT_ID", document_metadata: "METADATA", embedded_identifier: "METADATA", business_id: "BUSINESS_ID",
  "الاسم": "PERSON", "المالك": "OWNER", "الجوال": "PHONE", "البريد": "EMAIL", "الهوية": "NATIONAL_ID",
});
const tokenKinds = new Set<SensitiveKind>(["PERSON", "OWNER", "DELEGATE", "SIGNATORY", "ACCOUNT_ID"]);
export function classifyHeader(header: string): FieldClass {
  if (analyticalKinds.some((kind) => kind === header)) return {
    kind: header as AnalyticalKind, sensitivity: "ANALYTICAL", required: true, action: "KEEP", confidence: "EXACT_SCHEMA",
  };
  const kind = Object.hasOwn(sensitiveHeaders, header) ? sensitiveHeaders[header] : undefined;
  if (kind) return { kind, sensitivity: "IDENTIFIER", required: false,
    action: tokenKinds.has(kind) ? "TOKENIZE" : "REMOVE", confidence: "EXACT_SCHEMA" };
  return { kind: "UNKNOWN", sensitivity: "UNCERTAIN", required: false, action: "REVIEW", confidence: "AMBIGUOUS" };
}
export function profileHash() { return privacyHash({ profile, sensitiveHeaders, tokenKinds: [...tokenKinds] }); }
export type Detection = "EMAIL" | "PHONE" | "NATIONAL_ID" | "IBAN" | "PAYMENT_CARD" | "EMBEDDED" | "FREE_TEXT";
export function detectValue(text: string): Detection[] {
  const found: Detection[] = [];
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/u.test(text)) found.push("EMAIL");
  if (/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){10,30}\b/i.test(text)) found.push("IBAN");
  const digits = text.replace(/[ +().-]/g, "");
  if (/^\d{9,15}$/.test(digits)) found.push("PHONE");
  if (/^[12]\d{9}$/.test(digits)) found.push("NATIONAL_ID");
  if (/^\d{13,19}$/.test(digits)) found.push("PAYMENT_CARD");
  if (/[<>{}\u200b-\u200f\u202a-\u202e\u2066-\u2069]|data:|https?:|javascript:|^=|^@/iu.test(text)) found.push("EMBEDDED");
  return found;
}
const categories = new Set(["RENT", "TAX", "SALES", "PAYROLL", "OPERATING", "LIABILITY", "INSTALLMENT", "CASH_FLOW"]);
const units = new Set(["SAR", "USD", "EUR", "UNIT", "KG", "HOUR", "DAY", "MONTH", "PERCENT"]);
const currencies = new Set(["SAR", "USD", "EUR", "GBP", "AED"]);
export function assertAnalytical(kind: AnalyticalKind, text: string) {
  if (text.length > 128 || detectValue(text).includes("EMBEDDED")) throw new SanitizationError("AMBIGUOUS_VALUE");
  if (kind === "category") { if (!categories.has(text)) throw new SanitizationError("FREE_TEXT"); return; }
  if (kind === "unit" || kind === "currency") {
    if (!(kind === "unit" ? units : currencies).has(text)) throw new SanitizationError("AMBIGUOUS_VALUE"); return;
  }
  if (kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00.000Z`)) ||
      new Date(`${text}T00:00:00.000Z`).toISOString().slice(0, 10) !== text) throw new SanitizationError("AMBIGUOUS_VALUE");
    return;
  }
  if (kind === "period") {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(text)) throw new SanitizationError("AMBIGUOUS_VALUE"); return;
  }
  // No numeric conversion: sign, trailing zeroes and decimal precision remain exact.
  if (!/^[+-]?(?:0|[1-9]\d{0,8})(?:\.\d{1,12})?$/.test(text) ||
    /^[+-]?\d{9,}$/.test(text)) throw new SanitizationError("AMBIGUOUS_VALUE");
}
export type CsvTable = { headers: string[]; fields: FieldClass[]; rows: string[][] };
export function parseTable(bytes: Uint8Array): CsvTable {
  if (bytes.length > profile.maxBytes) throw new SanitizationError("RESOURCE_LIMIT");
  try {
    validateCsv(bytes, { ...initialIntakeLimits, cells: profile.maxCells }, {
      expanded: bytes.length, entries: 1, cells: 0, started: 0, now: () => 0,
    });
  } catch { throw new SanitizationError("MALFORMED_INPUT"); }
  const text = utf8(bytes); const matrix: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); matrix.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (row.length || cell.length) { row.push(cell); matrix.push(row); }
  const headers = matrix.shift();
  if (!headers || new Set(headers).size !== headers.length || headers.length > 40 ||
    !matrix.length || matrix.length > profile.maxRows || matrix.some((cells) => cells.some((value) => value.length > 256))) {
    throw new SanitizationError("MALFORMED_INPUT");
  }
  const fields = headers.map(classifyHeader);
  if (fields.some((field) => field.action === "REVIEW")) throw new SanitizationError("UNKNOWN_FIELD");
  if (!fields.some((field) => field.action === "KEEP")) throw new SanitizationError("MALFORMED_INPUT");
  if (fields.some((field, i) => fields.some((other, n) => n < i && other.kind === field.kind))) throw new SanitizationError("AMBIGUOUS_VALUE");
  return { headers, fields, rows: matrix };
}
