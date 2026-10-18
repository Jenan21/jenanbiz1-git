/**
 * Word-level bidirectional layout for the PDF writer.
 *
 * pdf-lib shapes an Arabic word correctly but reverses a whole mixed string (it turns "500,000" into "000,005"), so a line
 * is laid out here: the text is split into words, each word is classified, and the words are put in visual order and drawn
 * one at a time. Digits and Latin words keep their own left-to-right order inside an Arabic line, and the other way round.
 */
export type TextDirection = "rtl" | "ltr";
type Kind = "R" | "L" | "N";

const ARABIC = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LATIN_OR_DIGIT = /[A-Za-z0-9\u00C0-\u024F]/;
const MIRRORED: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«" };

/** The direction of the first letter that has one; `fallback` for text that has none (only digits or marks). */
export function detectDirection(text: string, fallback: TextDirection = "rtl"): TextDirection {
  for (const char of text) {
    if (ARABIC.test(char)) return "rtl";
    if (/[A-Za-z\u00C0-\u024F]/.test(char)) return "ltr";
  }
  return fallback;
}

function wordKind(word: string): Kind {
  if (ARABIC.test(word)) return "R";
  if (LATIN_OR_DIGIT.test(word)) return "L";
  return "N";
}

/** A bracket inside right-to-left text must face the other way, because the font only has the left-to-right shapes. */
export function mirrorBrackets(word: string) {
  return word.replace(/[()[\]{}<>«»]/g, (char) => MIRRORED[char] ?? char);
}

export type PlacedWord = { text: string; direction: TextDirection };

/**
 * The words of one line in left-to-right drawing order. `base` is the paragraph direction: runs of the opposite direction
 * keep their own order, and a lone mark between two words of one direction joins them.
 */
export function visualOrder(words: readonly string[], base: TextDirection): PlacedWord[] {
  const own: "R" | "L" = base === "rtl" ? "R" : "L";
  const kinds = words.map(wordKind);
  const resolved = kinds.map((kind, index): "R" | "L" => {
    if (kind !== "N") return kind;
    let before: Kind | undefined;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (kinds[cursor] !== "N") {
        before = kinds[cursor];
        break;
      }
    }
    let after: Kind | undefined;
    for (let cursor = index + 1; cursor < kinds.length; cursor += 1) {
      if (kinds[cursor] !== "N") {
        after = kinds[cursor];
        break;
      }
    }
    return before !== undefined && before === after && before !== "N" ? before : own;
  });

  const runs: Array<{ kind: "R" | "L"; words: string[] }> = [];
  words.forEach((word, index) => {
    const last = runs[runs.length - 1];
    if (last && last.kind === resolved[index]) last.words.push(word);
    else runs.push({ kind: resolved[index]!, words: [word] });
  });

  const ordered = base === "rtl" ? [...runs].reverse() : runs;
  const placed: PlacedWord[] = [];
  for (const run of ordered) {
    const inOrder = run.kind === "R" ? [...run.words].reverse() : run.words;
    for (const word of inOrder) {
      placed.push({ text: run.kind === "R" ? mirrorBrackets(word) : word, direction: run.kind === "R" ? "rtl" : "ltr" });
    }
  }
  return placed;
}

export type LaidOutLine = { words: PlacedWord[]; width: number };

/**
 * Wraps `text` into lines no wider than `maxWidth` (a word longer than a whole line is cut), then puts each line in visual
 * order. `measure` returns the drawn width of one word.
 */
export function layoutParagraph(
  text: string,
  options: { base: TextDirection; maxWidth: number; measure: (word: string) => number; space: number },
): LaidOutLine[] {
  const { base, maxWidth, measure, space } = options;
  const lines: LaidOutLine[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const logical = paragraph.split(/\s+/).filter(Boolean);
    if (!logical.length) {
      lines.push({ words: [], width: 0 });
      continue;
    }
    let current: string[] = [];
    let width = 0;
    const flush = () => {
      if (!current.length) return;
      const words = visualOrder(current, base);
      lines.push({ words, width: words.reduce((sum, word, index) => sum + measure(word.text) + (index ? space : 0), 0) });
      current = [];
      width = 0;
    };
    for (const word of logical) {
      for (const piece of splitLongWord(word, maxWidth, measure)) {
        const pieceWidth = measure(piece);
        if (current.length && width + space + pieceWidth > maxWidth) flush();
        width = current.length ? width + space + pieceWidth : pieceWidth;
        current.push(piece);
      }
    }
    flush();
  }
  return lines;
}

function splitLongWord(word: string, maxWidth: number, measure: (word: string) => number) {
  if (measure(word) <= maxWidth) return [word];
  const pieces: string[] = [];
  let chunk = "";
  for (const char of word) {
    if (chunk && measure(chunk + char) > maxWidth) {
      pieces.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) pieces.push(chunk);
  return pieces;
}
