import { cookies, headers } from "next/headers";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { resolveLocale } from "@/lib/i18n";

export async function getRequestDictionary() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = resolveLocale(
    cookieStore.get("locale")?.value ?? headerStore.get("accept-language"),
  );
  return { locale, dictionary: dictionaries[locale] };
}
