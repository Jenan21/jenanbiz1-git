export const STUDIO_FLOW_ROUTES = [
  { id: "dashboard", href: "/studio", label: ["الأدوات", "Tools"] },
  { id: "pdf", href: "/studio/pdf", label: ["Jenan PDF", "Jenan PDF"] },
  { id: "pdf-editor", href: "/studio/pdf/editor", label: ["محرر PDF", "PDF editor"] },
  { id: "docs", href: "/studio/docs", label: ["Jenan Docs", "Jenan Docs"] },
  { id: "sheets", href: "/studio/sheets", label: ["Jenan Sheets", "Jenan Sheets"] },
  { id: "presentations", href: "/studio/presentations", label: ["العروض", "Presentations"] },
  { id: "logo", href: "/studio/logo", label: ["الشعار والهوية", "Logo and brand"] },
  { id: "letterhead", href: "/studio/letterhead", label: ["الورق الرسمي", "Letterhead"] },
  { id: "cv", href: "/studio/cv", label: ["السيرة الذاتية", "CV builder"] },
  { id: "history", href: "/studio/history", label: ["سجل الملفات", "File history"] },
] as const;

export type StudioFlowRoute = (typeof STUDIO_FLOW_ROUTES)[number];
export type StudioToolId = Exclude<StudioFlowRoute["id"], "dashboard">;

export function resolveStudioFlow(flow: string[]) {
  const href = `/studio/${flow.join("/")}`;
  return STUDIO_FLOW_ROUTES.find((route) => route.href === href) ?? null;
}