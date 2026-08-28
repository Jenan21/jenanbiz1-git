"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import type { Locale } from "@/types/i18n";

export function LanguageSwitcher({
  locale,
  label,
  showChevron = false,
}: {
  locale: Locale;
  label: string;
  showChevron?: boolean;
}) {
  const router = useRouter();
  function switchLanguage() {
    const nextLocale = locale === "ar" ? "en" : "ar";
    document.cookie = `locale=${nextLocale};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }
  return (
    <IconButton
      className="language-switcher"
      onClick={switchLanguage}
      aria-label={label}
      lang={locale === "ar" ? "en" : "ar"}
      title={label}
    >
      <Icon name="globe" />
      <span>{locale === "ar" ? "EN" : "ع"}</span>
      {showChevron && <Icon name="chevron" />}
    </IconButton>
  );
}
