import { INTERFACE_VISIBILITY_GROUPS, PERSONALIZABLE_INTERFACE_ITEMS } from "@/lib/account/interface-visibility";

type Copy = readonly [string, string];

export interface SearchEntry {
  path: string;
  label: Copy;
  group: Copy;
  /** True for the top page of a section, which ranks above its child pages. */
  top: boolean;
}

const OWN_GROUP: Copy = ["حسابي", "My account"];

/** Pages that are not part of the personalisable sections but that a member goes looking for. */
const EXTRA_PAGES: ReadonlyArray<{ path: string; label: Copy; group: Copy }> = [
  { path: "/user", label: ["لوحة بياناتي", "My dashboard"], group: OWN_GROUP },
  { path: "/user/investments", label: ["بياناتي الاستثمارية", "My investment data"], group: OWN_GROUP },
  { path: "/account", label: ["إعدادات الحساب", "Account settings"], group: OWN_GROUP },
  { path: "/pricing", label: ["الأسعار والباقات", "Pricing"], group: ["المنصة", "Platform"] },
  { path: "/benefits", label: ["من نحن ومزايا المنصة", "About and benefits"], group: ["المنصة", "Platform"] },
];

/** Lower-cases and folds the spellings Arabic readers use interchangeably, so "ادوات" finds "أدوات". */
export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function buildIndex(): SearchEntry[] {
  const groups = new Map<string, Copy>(INTERFACE_VISIBILITY_GROUPS.map((group) => [group.id, group.label]));
  const entries = new Map<string, SearchEntry>();
  for (const item of PERSONALIZABLE_INTERFACE_ITEMS) {
    entries.set(item.path, { path: item.path, label: item.label, group: groups.get(item.group) ?? OWN_GROUP, top: item.level === "section" });
  }
  for (const page of EXTRA_PAGES) entries.set(page.path, { ...page, top: true });
  return [...entries.values()];
}

export const SEARCH_INDEX: readonly SearchEntry[] = buildIndex();

/** Pages whose name or section contains every word typed, best matches first. Searching never leaves the browser. */
export function searchPages(query: string, locale: "ar" | "en", limit = 7, index: readonly SearchEntry[] = SEARCH_INDEX): SearchEntry[] {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!tokens.length) return [];
  const position = locale === "ar" ? 0 : 1;
  const scored: Array<{ entry: SearchEntry; score: number }> = [];
  for (const entry of index) {
    const own = normalizeSearchText(entry.label[position]);
    const both = normalizeSearchText(`${entry.label[0]} ${entry.label[1]} ${entry.group[0]} ${entry.group[1]}`);
    let score = entry.top ? 1 : 0;
    let matches = true;
    for (const token of tokens) {
      if (!both.includes(token)) {
        matches = false;
        break;
      }
      if (own.startsWith(token)) score += 4;
      else if (own.split(" ").some((word) => word.startsWith(token))) score += 3;
      else if (own.includes(token)) score += 2;
      else score += 1;
    }
    if (matches) scored.push({ entry, score });
  }
  return scored
    .sort((left, right) => right.score - left.score || left.entry.path.length - right.entry.path.length)
    .slice(0, limit)
    .map((item) => item.entry);
}
