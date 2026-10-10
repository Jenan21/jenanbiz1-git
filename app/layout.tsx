import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { InterfaceVisibilityProvider } from "@/components/account/interface-visibility-provider";
import { getDirection, resolveLocale } from "@/lib/i18n";
import "@fontsource-variable/alexandria";
import "@/styles/globals.css";
import "@/styles/global-home.css";
import "@/styles/canonical-auth.css";
import "@/styles/authenticated-home.css";
import "@/styles/market-stage.css";
import "@/styles/projects-stage.css";
import "@/styles/projects-dashboard.css";
import "@/styles/project-analysis-dashboard.css";
import "@/styles/project-analysis-workflow.css";
import "@/styles/project-feasibility-dashboard.css";
import "@/styles/project-professional-feasibility.css";
import "@/styles/project-start-dashboard.css";
import "@/styles/project-start-workflow.css";
import "@/styles/project-evaluation-dashboard.css";
import "@/styles/programs-stage.css";
import "@/styles/software-stage.css";
import "@/styles/software-experience.css";
import "@/styles/growth-stage.css";
import "@/styles/account-module-stage.css";
import "@/styles/admin-stage.css";
import "@/styles/admin-operations.css";
import "@/styles/reports.css";
import "@/styles/auth-workflow.css";
import "@/styles/user-center.css";
import "@/styles/interface-visibility.css";
import "@/styles/user-investments-dashboard.css";
import "@/styles/academy-flow.css";
import "@/styles/market-flow.css";
import "@/styles/studio-flow.css";
import "@/styles/software-erp.css";
import "@/styles/talent-flow.css";
import "@/styles/approved-job-seeker.css";
import "@/styles/approved-job-seeker-flows.css";
import "@/styles/approved-talent-employer.css";
import "@/styles/marketing-flow.css";
import "@/styles/robotics-flow.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://jenanbiz.com"),
  applicationName: "Jenan Pro",
  title: {
    default: "Jenan Pro | Global Business Platform",
    template: "%s | Jenan Pro",
  },
  description:
    "Jenan Pro is a global business platform for operations, data intelligence, smart workflows, and scalable collaboration across teams and regions.",
  icons: {
    apple: "/apple-icon.png",
    icon: "/icon.png",
    shortcut: "/assets/jenan-pro-logo.jpg",
  },
  keywords: [
    "business platform",
    "global operations",
    "workflow automation",
    "smart enterprise",
    "digital business",
    "Jenan Pro",
  ],
  openGraph: {
    title: "Jenan Pro | Global Business Platform",
    description:
      "Modern operations, intelligent workflows, and a unified digital foundation for global teams.",
    siteName: "Jenan Pro",
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
      <body className="app-shell">
        <InterfaceVisibilityProvider />
        {children}
      </body>
    </html>
  );
}
