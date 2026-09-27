import { USER_CENTER_ROUTES } from "@/lib/account/user-center-routes";
import { academyFlowDefinitions } from "@/lib/academy/user-academy-routes";
import { marketFlowDefinitions } from "@/lib/market/market-flow-routes";
import { MARKETING_FLOW_ROUTES } from "@/lib/marketing/marketing-routes";
import { projectFlowDefinitions } from "@/lib/projects/project-flow-routes";
import { REPORT_DEFINITIONS } from "@/lib/reports/report-routes";
import { ROBOTICS_FLOW_ROUTES } from "@/lib/robotics/robotics-routes";
import { SOFTWARE_FLOW_ROUTES } from "@/lib/software/software-routes";
import { STUDIO_FLOW_ROUTES } from "@/lib/studio/studio-routes";
import { TALENT_FLOW_ROUTES } from "@/lib/talent/talent-routes";

export type AuthoritativeUiRoute = {
  path: string;
  section: "academy" | "admin" | "auth" | "home" | "market" | "marketing" | "projects" | "reports" | "robotics" | "software" | "studio" | "talent" | "user";
};

const define = (path: string, section: AuthoritativeUiRoute["section"]): AuthoritativeUiRoute => ({ path, section });

const legacyAdminPaths = [
  "/admin", "/admin/users", "/admin/subscriptions", "/admin/services", "/admin/finance",
  "/admin/ai", "/admin/agents", "/admin/audit", "/admin/health", "/admin/reports",
] as const;

export const AUTHORITATIVE_UI_ROUTES: readonly AuthoritativeUiRoute[] = [
  ...["/auth", "/auth/login", "/auth/register", "/auth/forgot", "/user/onboarding"].map((path) => define(path, "auth")),
  define("/home", "home"),
  ...USER_CENTER_ROUTES.filter((route) => route.path.startsWith("/user")).map((route) => define(route.path, "user")),
  define("/projects", "projects"),
  ...projectFlowDefinitions.map((route) => define(route.route, "projects")),
  define("/projects/feasibility", "projects"),
  define("/academy", "academy"),
  ...academyFlowDefinitions.map((route) => define(route.route, "academy")),
  define("/market", "market"),
  ...marketFlowDefinitions.map((route) => define(route.route, "market")),
  ...STUDIO_FLOW_ROUTES.map((route) => define(route.href, "studio")),
  ...SOFTWARE_FLOW_ROUTES.map((route) => define(route.route, "software")),
  ...TALENT_FLOW_ROUTES.map((route) => define(route.route, "talent")),
  ...MARKETING_FLOW_ROUTES.map((route) => define(route.route, "marketing")),
  ...ROBOTICS_FLOW_ROUTES.map((route) => define(route.route, "robotics")),
  ...legacyAdminPaths.map((path) => define(path, "admin")),
  ...REPORT_DEFINITIONS.map((route) => define(route.path, "reports")),
];