"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;

    optionRefs.current[locale === "ar" ? 0 : 1]?.focus();

    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>(".language-switcher")?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [locale, open]);

  function selectLanguage(nextLocale: Locale) {
    setOpen(false);
    if (nextLocale === locale) return;
    document.cookie = `locale=${nextLocale};path=/;max-age=31536000;samesite=lax`;
    window.location.reload();
  }

  function moveFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const activeIndex = optionRefs.current.findIndex((option) => option === document.activeElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = activeIndex < 0 ? 0 : (activeIndex + direction + 2) % 2;
    optionRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="language-switcher__root" ref={rootRef} data-open={open}>
      <IconButton
        type="button"
        className="language-switcher"
        onClick={() => setOpen((current) => !current)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        data-open={open}
      >
        <Icon name="globe" />
        <span lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
          {locale === "ar" ? "العربية" : "English"}
        </span>
        {showChevron && <Icon name="chevron" />}
      </IconButton>

      {open && (
        <div
          id={menuId}
          className="language-switcher__menu"
          role="menu"
          aria-label={locale === "ar" ? "اختر اللغة" : "Choose language"}
          onKeyDown={moveFocus}
        >
          <button
            ref={(element) => { optionRefs.current[0] = element; }}
            type="button"
            className="language-switcher__option"
            role="menuitemradio"
            aria-checked={locale === "ar"}
            lang="ar"
            dir="rtl"
            onClick={() => selectLanguage("ar")}
          >
            <span className="language-switcher__code">AR</span>
            <strong>العربية</strong>
            <i aria-hidden="true">✓</i>
          </button>
          <button
            ref={(element) => { optionRefs.current[1] = element; }}
            type="button"
            className="language-switcher__option"
            role="menuitemradio"
            aria-checked={locale === "en"}
            lang="en"
            dir="ltr"
            onClick={() => selectLanguage("en")}
          >
            <span className="language-switcher__code">EN</span>
            <strong>English</strong>
            <i aria-hidden="true">✓</i>
          </button>
        </div>
      )}
    </div>
  );
}
