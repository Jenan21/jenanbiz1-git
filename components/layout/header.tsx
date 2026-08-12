import { LogoPlaceholder } from "@/components/layout/logo-placeholder";
import { Icon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";
import { LogoutButton } from "@/components/auth/logout-button";

interface HeaderProps {
  locale: Locale;
  languageLabel: string;
  greeting: string;
  userLabel: string;
  logoutLabel: string;
  onMenu?: () => void;
}

export function Header({
  locale,
  languageLabel,
  greeting,
  userLabel,
  logoutLabel,
  onMenu,
}: HeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar__mobile-brand">
        <LogoPlaceholder compact />
      </div>
      {onMenu && (
        <IconButton className="topbar__menu" aria-label="Menu" onClick={onMenu}>
          <Icon name="menu" />
        </IconButton>
      )}
      <div className="topbar__intro">
        <span>{greeting}</span>
        <strong>{userLabel}</strong>
      </div>
      <div className="topbar__actions">
        <div className="topbar__search">
          <Icon name="search" />
          <input
            aria-label="Search"
            placeholder={locale === "ar" ? "بحث سريع..." : "Quick search..."}
          />
        </div>
        <LanguageSwitcher locale={locale} label={languageLabel} />
        <IconButton aria-label="Notifications">
          <Icon name="bell" />
          <i />
        </IconButton>
        <span className="avatar">JB</span>
        <LogoutButton label={logoutLabel} />
      </div>
    </header>
  );
}
