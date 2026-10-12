"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import type { Locale } from "@/types/i18n";

export function LanguageSwitcher({
  locale,
  label,
  showChevron = false,
  variant = "default",
}: {
  locale: Locale;
  label: string;
  showChevron?: boolean;
  variant?: "default" | "pair";
}) {
  const router = useRouter();
  function switchLanguage() {
    const nextLocale = locale === "ar" ? "en" : "ar";
    document.cookie = `locale=${nextLocale};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }
  if (variant === "pair") {
    return (
      <IconButton
        type="button"
        className="language-switcher language-switcher--pair"
        onClick={switchLanguage}
        aria-label={label}
      >
        <span lang="ar" data-active={locale === "ar" ? "true" : undefined}>
          العربية
        </span>
        <i aria-hidden="true" />
        <span lang="en" data-active={locale === "en" ? "true" : undefined}>
          English
        </span>
      </IconButton>
    );
  }
  return (
    <IconButton
      className="language-switcher"
      onClick={switchLanguage}
      aria-label={label}
    >
      <Icon name="globe" />
      <span>{locale === "ar" ? "EN" : "ع"}</span>
      {showChevron && <Icon name="chevron" />}
    </IconButton>
  );
}
