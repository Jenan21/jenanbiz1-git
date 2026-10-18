/**
 * Layout helpers for the one-screen report. A card on that screen has a fixed size and never scrolls, so a list shows the
 * few items that fit and leaves the rest, in full, to the «عرض التفاصيل» dialog. The estimates are deliberately generous
 * (a line holds fewer characters than it really does), so a card can end up a little emptier than it could be but its
 * text can never run past its edge.
 */

/** A short text cut at a word, with "…". The full text is always shown in a dialog next to it. */
export function clampText(text: string, max: number) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return { text: clean, clamped: false };
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  const base = space > max * 0.6 ? cut.slice(0, space) : cut;
  return { text: `${base.replace(/[\s.,،:;؛\-–—]+$/u, "")}…`, clamped: true };
}

/** How many lines a text needs in a box that holds `charsPerLine` characters. */
export function linesFor(text: string, charsPerLine: number) {
  return Math.max(1, Math.ceil(text.length / Math.max(1, charsPerLine)));
}

/**
 * The items that fit a line budget, in order. The first item is always kept (an empty card would say nothing), and an item
 * that would pass the budget ends the list.
 */
export function fitItems<T>(items: readonly T[], options: { budget: number; lines: (item: T) => number; max?: number }) {
  const shown: T[] = [];
  let used = 0;
  for (const item of items) {
    if (options.max !== undefined && shown.length >= options.max) break;
    const cost = options.lines(item);
    if (shown.length > 0 && used + cost > options.budget) break;
    shown.push(item);
    used += cost;
  }
  return { shown, hidden: items.length - shown.length };
}
