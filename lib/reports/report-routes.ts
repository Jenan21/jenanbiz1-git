export const REPORT_ROUTES = [
  "/reports/view/general",
  "/reports/print/project-analysis",
  "/reports/print/project-evaluation",
  "/reports/view/portfolio",
  "/reports/view/investment",
] as const;

export type ReportRoute = (typeof REPORT_ROUTES)[number];

export function isReportRoute(path: string): path is ReportRoute {
  return REPORT_ROUTES.includes(path as ReportRoute);
}