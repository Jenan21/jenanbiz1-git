/**
 * A deterministic check that a free-text answer is something a person could have meant, before the platform spends
 * outside-data lookups or stores a record on it. It cannot judge whether an idea is good, only whether it is
 * understandable: it rejects repeated letters ("ههههه", "aaaa"), keyboard mashing, text with almost no variety, and
 * answers that are too short to be an idea. No server-only imports, so forms can run it before sending anything.
 */
export type TextProblem = "TOO_FEW_LETTERS" | "TOO_FEW_WORDS" | "REPEATED_LETTERS" | "REPEATED_WORDS" | "LOW_VARIETY" | "KEYBOARD_MASH";

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "ضصثقفغعهخحجد", "شسيبلاتنمكط", "ئءؤرلاىةوزظ"];

const isLetter = (character: string) => /\p{L}/u.test(character);

/** Lower-cases, folds width variants, and drops Arabic marks and tatweel so "هــــه" and "هَه" compare like "هه". */
function normalise(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\u0640\u064b-\u065f\u0670]/g, "");
}

function longestRun(letters: string[]) {
  let best = 0;
  let run = 0;
  let previous = "";
  for (const letter of letters) {
    run = letter === previous ? run + 1 : 1;
    previous = letter;
    if (run > best) best = run;
  }
  return best;
}

/** Five neighbouring keys in a row, in either direction. It looks inside one word, never across a space. */
function hasKeyboardSequence(word: string, length = 5) {
  for (const row of KEYBOARD_ROWS) {
    const reversed = [...row].reverse().join("");
    for (let start = 0; start + length <= row.length; start += 1) {
      if (word.includes(row.slice(start, start + length)) || word.includes(reversed.slice(start, start + length))) return true;
    }
  }
  return false;
}

export interface TextQualityOptions {
  /** How many words with at least two letters the answer needs. An idea needs two; a name needs one. */
  minWords?: number;
  /** How many letters in total the answer needs. */
  minLetters?: number;
}

/** The first reason the text could not be understood, or null when it looks like a real description. */
export function textProblem(value: string, options: TextQualityOptions = {}): TextProblem | null {
  const { minWords = 2, minLetters = 8 } = options;
  const text = normalise(value);
  const words = text
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => [...word].filter(isLetter))
    .filter((letters) => letters.length >= 2);
  const letters = words.flat();
  if ([...text].filter(isLetter).length < minLetters) return "TOO_FEW_LETTERS";
  if (words.length < minWords) return "TOO_FEW_WORDS";

  if (words.some((word) => longestRun(word) >= 4)) return "REPEATED_LETTERS";
  const spelled = words.map((word) => word.join(""));
  if (spelled.length >= 3 && new Set(spelled).size < 2) return "REPEATED_WORDS";

  const counts = new Map<string, number>();
  for (const letter of letters) counts.set(letter, (counts.get(letter) ?? 0) + 1);
  const mostCommon = Math.max(...counts.values());
  // The dominance check needs enough letters to mean something: "Mama Mia" is a real name.
  const dominated = letters.length >= 12 && mostCommon / letters.length > 0.4;
  if (counts.size < Math.min(5, Math.ceil(letters.length / 3)) || dominated) return "LOW_VARIETY";

  if (spelled.some((word) => hasKeyboardSequence(word))) return "KEYBOARD_MASH";
  return null;
}

/** The lighter rule for names: they may be one short word, but still cannot be a mash of the same letter. */
export function nameProblem(value: string): TextProblem | null {
  const problem = textProblem(value, { minWords: 1, minLetters: 2 });
  if (problem === "TOO_FEW_LETTERS" || problem === "TOO_FEW_WORDS") return problem;
  if ([...normalise(value)].filter(isLetter).length < 6) return null;
  return problem === "REPEATED_LETTERS" || problem === "LOW_VARIETY" || problem === "KEYBOARD_MASH" ? problem : null;
}

const MESSAGES = {
  ar: {
    TOO_FEW_LETTERS: "النص قصير جدًا. اكتب وصفًا حقيقيًا لفكرتك.",
    TOO_FEW_WORDS: "اكتب الفكرة بكلمتين على الأقل، مثل: منصة توصيل منتجات صحية.",
    REPEATED_LETTERS: "النص يحتوي على حروف مكررة (مثل ههههه) ولا يمثل فكرة مفهومة. اكتب وصفًا حقيقيًا لمشروعك.",
    REPEATED_WORDS: "النص يكرر الكلمة نفسها. اكتب وصفًا حقيقيًا لمشروعك.",
    LOW_VARIETY: "النص لا يبدو وصفًا مفهومًا. اكتب فكرتك بكلمات واضحة.",
    KEYBOARD_MASH: "النص يبدو ضغطًا عشوائيًا على لوحة المفاتيح. اكتب فكرتك بكلمات واضحة.",
  },
  en: {
    TOO_FEW_LETTERS: "That is too short. Describe your idea for real.",
    TOO_FEW_WORDS: "Write the idea in at least two words, for example: healthy product delivery platform.",
    REPEATED_LETTERS: "The text repeats letters (like aaaa) and is not an understandable idea. Describe your project for real.",
    REPEATED_WORDS: "The text repeats the same word. Describe your project for real.",
    LOW_VARIETY: "The text does not read as a description. Write the idea in clear words.",
    KEYBOARD_MASH: "The text looks like random keys. Write the idea in clear words.",
  },
} as const;

export function textProblemMessage(problem: TextProblem, locale: "ar" | "en") {
  return MESSAGES[locale][problem];
}

/** The same message in both languages for API answers, which do not know the reader's language. */
export function textProblemBilingualMessage(problem: TextProblem) {
  return `${MESSAGES.ar[problem]} / ${MESSAGES.en[problem]}`;
}

/** Marker carried by schema issues so routes can turn them into a readable answer. */
export const TEXT_QUALITY_ISSUE_PREFIX = "TEXT_QUALITY:";
export function textQualityIssue(problem: TextProblem) {
  return `${TEXT_QUALITY_ISSUE_PREFIX}${problem}`;
}
export function problemFromIssue(message: string): TextProblem | null {
  if (!message.startsWith(TEXT_QUALITY_ISSUE_PREFIX)) return null;
  const code = message.slice(TEXT_QUALITY_ISSUE_PREFIX.length) as TextProblem;
  return code in MESSAGES.en ? code : null;
}
