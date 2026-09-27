export const ROBOTICS_FLOW_ROUTES = [
  { id: "dashboard", route: "/robotics", title: ["Jenan Robotics", "Jenan Robotics"] },
  { id: "search", route: "/robotics/search", title: ["البحث عن روبوت", "Find a robot"] },
  { id: "results", route: "/robotics/results", title: ["نتائج الروبوتات", "Robot results"] },
  { id: "item", route: "/robotics/item/sample", title: ["تفاصيل روبوت", "Robot details"] },
  { id: "recommendations", route: "/robotics/recommendations", title: ["التوصيات", "Recommendations"] },
] as const;

export type RoboticsFlowRoute = (typeof ROBOTICS_FLOW_ROUTES)[number];
export type RoboticsRouteId = RoboticsFlowRoute["id"];

export function resolveRoboticsFlow(flow: string[]) {
  const route = `/robotics/${flow.join("/")}`;
  return ROBOTICS_FLOW_ROUTES.find((definition) => definition.route === route) ?? null;
}