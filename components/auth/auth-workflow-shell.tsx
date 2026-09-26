import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";

export function AuthWorkflowShell({
  children,
  description,
  eyebrow,
  locale,
  title,
}: {
  children: ReactNode;
  description: string;
  eyebrow: string;
  locale: Locale;
  title: string;
}) {
  const ar = locale === "ar";
  return (
    <main className="auth-workflow">
      <div className="auth-workflow__backdrop" aria-hidden="true" />
      <header className="auth-workflow__header">
        <Link href="/" className="auth-workflow__brand" aria-label={ar ? "Jenan Pro الرئيسية" : "Jenan Pro home"}>
          <span aria-hidden="true">J</span>
          <strong>Jenan <b>PRO</b><small>{ar ? "أعمال بلا حدود" : "Business without limits"}</small></strong>
        </Link>
        <LanguageSwitcher locale={locale} label={ar ? "Switch to English" : "التبديل إلى العربية"} />
      </header>
      <div className="auth-workflow__content">
        <section className="auth-workflow__intro">
          <span className="eyebrow eyebrow--small">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
          <div className="auth-workflow__assurance">
            <span><Icon name="shield" /><b>{ar ? "اتصال آمن" : "Secure connection"}</b></span>
            <span><Icon name="activity" /><b>{ar ? "تدقيق موثق" : "Audited actions"}</b></span>
            <span><Icon name="globe" /><b>{ar ? "وصول عالمي" : "Global access"}</b></span>
          </div>
        </section>
        <div className="auth-workflow__visual" aria-hidden="true">
          <span className="auth-workflow__visual-ring" />
          <strong>J</strong>
          <small>JENAN PRO</small>
        </div>
        <section className="auth-workflow__milestones" aria-label={ar ? "مراحل الوصول الآمن" : "Secure access stages"}>
          <article><span>01</span><strong>{ar ? "الهوية" : "Identity"}</strong><small>{ar ? "بيانات الحساب" : "Account details"}</small></article>
          <article><span>02</span><strong>{ar ? "التحقق" : "Verification"}</strong><small>{ar ? "إثبات الوصول" : "Access proof"}</small></article>
          <article><span>03</span><strong>{ar ? "الحماية" : "Protection"}</strong><small>{ar ? "جلسة مشفرة" : "Encrypted session"}</small></article>
        </section>
        <section className="auth-workflow__panel">{children}</section>
        <aside className="auth-workflow__status">
          <header><span>{ar ? "الحالة السريعة" : "Quick status"}</span><b>{ar ? "آمن" : "SECURE"}</b></header>
          <ul>
            <li><Icon name="check" /><span><strong>{ar ? "البيانات" : "Details"}</strong><small>{ar ? "مشفرة أثناء النقل" : "Encrypted in transit"}</small></span></li>
            <li><Icon name="shield" /><span><strong>{ar ? "المحاولات" : "Attempts"}</strong><small>{ar ? "محدودة ومراقبة" : "Limited and monitored"}</small></span></li>
            <li><Icon name="activity" /><span><strong>{ar ? "التدقيق" : "Audit"}</strong><small>{ar ? "أحداث حساسة موثقة" : "Sensitive events recorded"}</small></span></li>
          </ul>
          <p>{ar ? "لا يطلب Jenan PRO كلمة المرور أو رمز الاستعادة خارج هذه البوابة." : "Jenan PRO never asks for your password or recovery code outside this gateway."}</p>
        </aside>
      </div>
      <footer className="auth-workflow__footer">
        <span>{ar ? "© 2026 منصة جنان برو" : "© 2026 Jenan Pro"}</span>
        <Link href="/auth/login">{ar ? "تسجيل الدخول" : "Sign in"}</Link>
      </footer>
    </main>
  );
}