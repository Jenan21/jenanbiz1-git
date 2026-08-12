import Link from "next/link";
import { LogoPlaceholder } from "@/components/layout/logo-placeholder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function HomePage() {
  const { locale } = await getRequestDictionary();
  const ar = locale === "ar";
  return (
    <main className="auth-page">
      <div className="aurora aurora--one" />
      <div className="aurora aurora--two" />
      <div className="grid-plane" />
      <header className="auth-page__header">
        <LogoPlaceholder />
        <LanguageSwitcher
          locale={locale}
          label={ar ? "التبديل إلى الإنجليزية" : "Switch to Arabic"}
        />
      </header>
      <Card className="auth-panel home-panel">
        <p className="eyebrow">
          <Icon name="sparkles" />
          {ar ? "أعمال أذكى، برؤية أوضح" : "Smarter business, clearer vision"}
        </p>
        <h1>
          {ar ? "نواة Jenan BIZ جاهزة للنمو" : "Jenan BIZ is built to grow"}
        </h1>
        <p className="auth-panel__subtitle">
          {ar
            ? "هوية رقمية موحدة تجمع البساطة، الذكاء، والتحكم."
            : "A unified digital identity combining simplicity, intelligence, and control."}
        </p>
        <div className="home-actions">
          <Link href="/login">
            <Button>
              {ar ? "تسجيل الدخول" : "Sign in"}
              <Icon name="arrow" />
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="secondary">
              {ar ? "استعراض اللوحة" : "View dashboard"}
            </Button>
          </Link>
        </div>
      </Card>
      <footer className="auth-page__footer">
        <span>© 2026 Jenan BIZ</span>
        <Link href="/admin">{ar ? "بوابة الإدارة" : "Admin portal"}</Link>
      </footer>
    </main>
  );
}
