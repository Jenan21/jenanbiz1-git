import { GlobalCommandHome } from "@/components/home/global-command-home";
import { getRequestDictionary } from "@/lib/i18n/server";
import { readPlatformCatalog } from "@/lib/platform/catalog";

export default async function HomePage() {
  const [{ locale }, catalog] = await Promise.all([
    getRequestDictionary(),
    readPlatformCatalog(),
  ]);

  return (
    <GlobalCommandHome
      locale={locale}
      modules={catalog.modules.filter((module) => module.id !== "dashboard")}
    />
  );
}
