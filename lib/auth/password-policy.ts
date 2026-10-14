/**
 * The owner's password rule (decision of 2026-10-14): at least four characters and at least one capital letter.
 * Length beyond that, digits and symbols are the person's own choice. This file is shared with the browser, so it has
 * no server-only imports.
 */
export const PASSWORD_MIN_LENGTH = 4;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordProblem = "TOO_SHORT" | "NO_UPPERCASE" | "TOO_LONG";

/** The first rule a password breaks, or null when it is acceptable. Any script's capital letter counts. */
export function passwordProblem(value: string): PasswordProblem | null {
  if (value.length < PASSWORD_MIN_LENGTH) return "TOO_SHORT";
  if (value.length > PASSWORD_MAX_LENGTH) return "TOO_LONG";
  if (!/\p{Lu}/u.test(value)) return "NO_UPPERCASE";
  return null;
}

export function passwordProblemMessage(problem: PasswordProblem, locale: "ar" | "en") {
  const messages = {
    ar: {
      TOO_SHORT: `كلمة المرور ${PASSWORD_MIN_LENGTH} أحرف على الأقل.`,
      NO_UPPERCASE: "يجب أن تحتوي كلمة المرور على حرف كبير (A-Z) واحد على الأقل.",
      TOO_LONG: `كلمة المرور لا تزيد على ${PASSWORD_MAX_LENGTH} حرفًا.`,
    },
    en: {
      TOO_SHORT: `The password needs at least ${PASSWORD_MIN_LENGTH} characters.`,
      NO_UPPERCASE: "The password needs at least one capital letter (A-Z).",
      TOO_LONG: `The password cannot be longer than ${PASSWORD_MAX_LENGTH} characters.`,
    },
  } as const;
  return messages[locale][problem];
}

export const PASSWORD_RULE_NOTE = {
  ar: "4 أحرف على الأقل مع حرف كبير واحد",
  en: "At least 4 characters, including one capital letter",
} as const;
