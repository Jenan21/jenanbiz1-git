import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { getDirection, resolveLocale } from "@/lib/i18n";
import "@/styles/globals.css";
import "@/styles/internal-workspace.css";

export const metadata: Metadata = {
  title: { default: "Jenan BIZ", template: "%s | Jenan BIZ" },
  description: "Jenan BIZ business platform",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = resolveLocale(
    cookieStore.get("locale")?.value ?? headerStore.get("accept-language"),
  );
  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      data-theme="balanced-dark"
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
