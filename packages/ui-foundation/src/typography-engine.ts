import type { Direction, Locale } from "@/types/i18n";

export interface TypographyScale {
  family: string;
  sizePx: number;
  weight: number;
  lineHeight: number;
  letterSpacingEm: number;
}

export interface TypographyProfile {
  locale: Locale;
  direction: Direction;
  body: TypographyScale;
  heading: TypographyScale;
}

export function createTypographyProfile(
  locale: Locale,
  direction: Direction,
): TypographyProfile {
  const arabic = locale === "ar";
  return {
    locale,
    direction,
    body: {
      family: arabic ? "Cairo" : "Inter",
      sizePx: arabic ? 16 : 15,
      weight: 400,
      lineHeight: arabic ? 1.8 : 1.6,
      letterSpacingEm: arabic ? 0 : 0.01,
    },
    heading: {
      family: arabic ? "Cairo" : "Inter",
      sizePx: arabic ? 28 : 30,
      weight: 700,
      lineHeight: 1.2,
      letterSpacingEm: arabic ? 0 : 0.005,
    },
  };
}
