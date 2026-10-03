import { CanonicalAuthAccessPage } from "@/components/auth/canonical-auth-access-page";
import { getRequestDictionary } from "@/lib/i18n/server";
import { readPlatformCatalog } from "@/lib/platform/catalog";

export default async function ForgotPasswordPage() {
  const [{ locale }, catalog] = await Promise.all([
    getRequestDictionary(),
    readPlatformCatalog(),
  ]);
  return (
    <CanonicalAuthAccessPage
      locale={locale}
      mode="login"
      modules={catalog.modules.filter((module) => module.id !== "dashboard")}
      recovery
    />
  );
}