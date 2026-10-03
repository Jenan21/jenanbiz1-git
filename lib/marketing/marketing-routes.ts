export const MARKETING_FLOW_ROUTES = [
  { id: "dashboard", route: "/marketing", title: ["التسويق والإعلانات", "Marketing and advertising"] },
  { id: "campaigns", route: "/marketing/campaigns", title: ["الحملات", "Campaigns"] },
  { id: "campaign-new", route: "/marketing/campaign/new", title: ["إنشاء حملة", "Create campaign"] },
  { id: "campaign-detail", route: "/marketing/campaign/sample", title: ["تفاصيل الحملة", "Campaign details"] },
  { id: "audience", route: "/marketing/audience", title: ["الجمهور", "Audience"] },
  { id: "channels", route: "/marketing/channels", title: ["القنوات", "Channels"] },
  { id: "leads", route: "/marketing/leads", title: ["العملاء المحتملون", "Leads"] },
  { id: "analytics", route: "/marketing/analytics", title: ["تحليلات التسويق", "Marketing analytics"] },
  { id: "report", route: "/marketing/report/sample", title: ["تقرير الحملة", "Campaign report"] },
] as const;

export type MarketingFlowRoute = (typeof MARKETING_FLOW_ROUTES)[number];
export type MarketingRouteId = MarketingFlowRoute["id"];

export function resolveMarketingFlow(flow: string[]) {
  const route = `/marketing/${flow.join("/")}`;
  return MARKETING_FLOW_ROUTES.find((definition) => definition.route === route) ?? null;
}