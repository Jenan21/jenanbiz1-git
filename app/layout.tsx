import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { getDirection, resolveLocale } from "@/lib/i18n";
import "@/styles/globals.css";
import "@/styles/design-system.css";
import "@/styles/internal-workspace.css";
import "@/styles/division-workspace.css";
import "@/styles/module-identity.css";
import "@/styles/module-showcase.css";
import "@/styles/service-screens.css";
import "@/styles/admin-catalog.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://jenanbiz.com"),
  applicationName: "Jenan BIZ",
  title: {
    default: "Jenan BIZ | Global Business Platform",
    template: "%s | Jenan BIZ",
  },
  description:
    "Jenan BIZ is a global business platform for operations, data intelligence, smart workflows, and scalable collaboration across teams and regions.",
  keywords: [
    "business platform",
    "global operations",
    "workflow automation",
    "smart enterprise",
    "digital business",
    "Jenan BIZ",
  ],
  openGraph: {
    title: "Jenan BIZ | Global Business Platform",
    description:
      "Modern operations, intelligent workflows, and a unified digital foundation for global teams.",
    siteName: "Jenan BIZ",
    type: "website",
  },
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
      <body className="app-shell">{children}</body>
    </html>
  );
}
