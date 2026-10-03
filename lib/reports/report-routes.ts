export const REPORT_DEFINITIONS = [
  { id: "general", kind: "VIEW", path: "/reports/view/general", source: "PROJECT_RECORDS" },
  { id: "project-analysis", kind: "PRINT", path: "/reports/print/project-analysis", source: "PROJECT_RECORDS" },
  { id: "project-evaluation", kind: "PRINT", path: "/reports/print/project-evaluation", source: "PROJECT_RECORDS" },
  { id: "portfolio", kind: "VIEW", path: "/reports/view/portfolio", source: "AWAITING_APPROVED_SOURCE" },
  { id: "investment", kind: "VIEW", path: "/reports/view/investment", source: "AWAITING_APPROVED_SOURCE" },
] as const;

export type ReportRoute = (typeof REPORT_DEFINITIONS)[number]["path"];

export const REPORT_ROUTES = REPORT_DEFINITIONS.map((definition) => definition.path);

export function isReportRoute(path: string): path is ReportRoute {
  return REPORT_ROUTES.some((route) => route === path);
}