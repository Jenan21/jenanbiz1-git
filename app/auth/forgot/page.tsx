import { AuthAccessPage } from "@/components/auth/auth-access-page";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function ForgotPasswordPage() {
  const { locale } = await getRequestDictionary();
  const ar = locale === "ar";
  return (
    <AuthAccessPage
      locale={locale}
      mode="login"
      recovery
      languageLabel={ar ? "التبديل إلى الإنجليزية" : "Switch to Arabic"}
    />
  );
}