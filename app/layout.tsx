import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { getDirection, resolveLocale } from "@/lib/i18n";
import "@/styles/globals.css";
import "@/styles/internal-workspace.css";
import "@/styles/data-center.css";
import "@/styles/global-health.css";
import "@/styles/social-growth.css";
import "@/styles/admin-light-theme.css";
import "@/styles/world-class-workspaces.css";

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
