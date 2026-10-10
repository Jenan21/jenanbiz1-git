export const TALENT_FLOW_ROUTES = [
  { id: "dashboard", route: "/talent", title: ["التوظيف الذكي", "Smart employment"] },
  { id: "jobs", route: "/talent/jobs", title: ["الوظائف والطلبات", "Jobs and applications"] },
  { id: "job-detail", route: "/talent/job/sample", title: ["تفاصيل الوظيفة", "Job details"] },
  { id: "apply", route: "/talent/apply/sample", title: ["التقديم على وظيفة", "Apply for a job"] },
  { id: "profile", route: "/talent/profile", title: ["الملف المهني", "Professional profile"] },
  { id: "employer", route: "/talent/employer", title: ["لوحة صاحب العمل", "Employer dashboard"] },
  { id: "employer-post", route: "/talent/employer/post", title: ["نشر وظيفة", "Post a job"] },
  { id: "employer-applicants", route: "/talent/employer/applicants", title: ["إدارة المتقدمين", "Manage applicants"] },
  { id: "candidate", route: "/talent/candidate/sample", title: ["ملف المرشح", "Candidate profile"] },
  { id: "search", route: "/talent/search", title: ["البحث في المواهب", "Talent search"] },
  { id: "matching", route: "/talent/matching", title: ["المطابقة الذكية", "Smart matching"] },
  { id: "reports", route: "/talent/reports", title: ["تقارير التوظيف", "Hiring reports"] },
] as const;

export type TalentFlowRoute = (typeof TALENT_FLOW_ROUTES)[number];
export type TalentRouteId = TalentFlowRoute["id"];

export function resolveTalentFlow(flow: string[]) {
  const route = `/talent/${flow.join("/")}`;
  return TALENT_FLOW_ROUTES.find((definition) => definition.route === route) ?? null;
}