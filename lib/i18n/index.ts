import { appConfig } from "@/config/app";
import type { Direction, Locale } from "@/types/i18n";

export function isLocale(value: string): value is Locale {
  return appConfig.supportedLocales.includes(value as Locale);
}

export function resolveLocale(value?: string | null): Locale {
  if (!value) return appConfig.defaultLocale;
  const candidate = value.toLowerCase().split(/[-_,;]/)[0];
  return candidate && isLocale(candidate) ? candidate : appConfig.defaultLocale;
}

export function getDirection(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}
