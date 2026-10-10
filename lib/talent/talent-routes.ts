export const TALENT_FLOW_ROUTES = [
  { id: "dashboard", route: "/talent", title: ["التوظيف الذكي", "Smart employment"] },
  { id: "jobs", route: "/talent/jobs", title: ["الوظائف المناسبة لك", "Jobs for you"] },
  { id: "saved-jobs", route: "/talent/jobs/saved", title: ["الوظائف المحفوظة", "Saved jobs"] },
  { id: "job-detail", route: "/talent/jobs/[jobId]", title: ["تفاصيل الوظيفة", "Job details"] },
  { id: "apply", route: "/talent/jobs/[jobId]/apply", title: ["التقديم على الوظيفة", "Apply for the job"] },
  { id: "applications", route: "/talent/applications", title: ["تتبع طلباتي", "Track my applications"] },
  { id: "application-detail", route: "/talent/applications/[applicationId]", title: ["تفاصيل طلب التوظيف", "Application details"] },
  { id: "profile", route: "/talent/profile", title: ["الملف المهني", "Professional profile"] },
  { id: "cv", route: "/talent/profile/cv", title: ["السيرة الذاتية", "Curriculum vitae"] },
  { id: "interviews", route: "/talent/interviews", title: ["المقابلات", "Interviews"] },
  { id: "notifications", route: "/talent/notifications", title: ["الإشعارات", "Notifications"] },
  { id: "messages", route: "/talent/messages", title: ["الرسائل والتواصل", "Messages and communication"] },
  { id: "company", route: "/talent/companies/[organizationId]", title: ["ملف الشركة", "Company profile"] },
  { id: "matching", route: "/talent/matching", title: ["المطابقة الذكية", "Smart matching"] },
  { id: "employer", route: "/talent/employer", title: ["لوحة صاحب العمل", "Employer dashboard"] },
  { id: "employer-post", route: "/talent/employer/jobs/new", title: ["نشر وظيفة جديدة", "Post a new job"] },
  { id: "employer-jobs", route: "/talent/employer/jobs", title: ["إدارة الوظائف", "Manage jobs"] },
  { id: "employer-requests", route: "/talent/employer/requests", title: ["طلبات التوظيف", "Employment requests"] },
  { id: "search", route: "/talent/employer/search", title: ["البحث عن المرشحين", "Candidate search"] },
  { id: "employer-shortlists", route: "/talent/employer/shortlists", title: ["القوائم المختصرة", "Shortlists"] },
  { id: "employer-applicants", route: "/talent/employer/applicants", title: ["إدارة المتقدمين", "Manage applicants"] },
  { id: "candidate", route: "/talent/employer/candidates/[applicationId]", title: ["ملف المرشح", "Candidate profile"] },
  { id: "employer-interviews", route: "/talent/employer/interviews", title: ["المقابلات", "Interviews"] },
  { id: "employer-messages", route: "/talent/employer/messages", title: ["الرسائل", "Messages"] },
  { id: "employer-pipeline", route: "/talent/employer/pipeline", title: ["مراحل التوظيف", "Hiring pipeline"] },
  { id: "employer-company", route: "/talent/employer/company", title: ["ملف الشركة", "Company profile"] },
  { id: "employer-settings", route: "/talent/employer/settings", title: ["إعدادات التوظيف", "Hiring settings"] },
  { id: "reports", route: "/talent/employer/reports", title: ["تقارير التوظيف", "Hiring reports"] },
  { id: "employer-support", route: "/talent/employer/support", title: ["الدعم والمساعدة", "Support and help"] },
] as const;

export type TalentFlowRoute = (typeof TALENT_FLOW_ROUTES)[number];
export type TalentRouteId = TalentFlowRoute["id"];

export function resolveTalentFlow(flow: string[]) {
  const route = `/talent/${flow.join("/")}`;
  const exact = TALENT_FLOW_ROUTES.find((definition) => definition.route === route);
  if (exact) return exact;
  if (flow.length === 2 && flow[0] === "jobs" && flow[1] !== "saved") {
    return TALENT_FLOW_ROUTES.find((definition) => definition.id === "job-detail") ?? null;
  }
  if (flow.length === 3 && flow[0] === "jobs" && flow[2] === "apply") {
    return TALENT_FLOW_ROUTES.find((definition) => definition.id === "apply") ?? null;
  }
  if (flow.length === 2 && flow[0] === "applications") {
    return TALENT_FLOW_ROUTES.find((definition) => definition.id === "application-detail") ?? null;
  }
  if (flow.length === 2 && flow[0] === "companies") {
    return TALENT_FLOW_ROUTES.find((definition) => definition.id === "company") ?? null;
  }
  if (flow.length === 3 && flow[0] === "employer" && flow[1] === "candidates") {
    return TALENT_FLOW_ROUTES.find((definition) => definition.id === "candidate") ?? null;
  }
  if (flow.length === 2 && flow[0] === "job" && flow[1] === "sample") {
    return TALENT_FLOW_ROUTES.find((definition) => definition.id === "job-detail") ?? null;
  }
  if (flow.length === 2 && flow[0] === "apply" && flow[1] === "sample") {
    return TALENT_FLOW_ROUTES.find((definition) => definition.id === "apply") ?? null;
  }
  if (flow.length === 2 && flow[0] === "employer" && flow[1] === "post") {
    return TALENT_FLOW_ROUTES.find((definition) => definition.id === "employer-post") ?? null;
  }
  if (flow.length === 2 && flow[0] === "candidate" && flow[1] === "sample") {
    return TALENT_FLOW_ROUTES.find((definition) => definition.id === "candidate") ?? null;
  }
  if (flow.length === 1 && flow[0] === "search") {
    return TALENT_FLOW_ROUTES.find((definition) => definition.id === "search") ?? null;
  }
  if (flow.length === 1 && flow[0] === "reports") {
    return TALENT_FLOW_ROUTES.find((definition) => definition.id === "reports") ?? null;
  }
  return null;
}