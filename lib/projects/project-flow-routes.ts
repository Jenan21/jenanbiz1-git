export type ProjectFocus = "assessment" | "compliance" | "create" | "evidence" | "feasibility" | "governance" | "intelligence" | "launch" | "report" | "risk" | "team" | "vendors" | "workflow";
export type ProjectFlowGroup = "analysis" | "evaluation" | "feasibility" | "start";

export type ProjectFlowDefinition = {
  description: readonly [string, string];
  focus: ProjectFocus;
  group: ProjectFlowGroup;
  kind: string;
  route: string;
  title: readonly [string, string];
};

const descriptions: Record<ProjectFlowGroup, readonly [string, string]> = {
  analysis: ["رحلة تحليل موثقة تربط المدخلات بالسوق والموقع والمخاطر والتقرير.", "An evidence-backed analysis flow connecting inputs, market, location, risks, and reporting."],
  evaluation: ["تقييم موزون يعتمد على الدرجات والأدلة والمصادر والقرار البشري.", "A weighted evaluation based on scores, evidence, sources, and a human decision."],
  feasibility: ["دراسة جدوى مبسطة أو احترافية بحسابات حتمية من المدخلات الفعلية.", "A simplified or professional feasibility study using deterministic calculations from real inputs."],
  start: ["مسار بدء منضبط لا ينتقل للتنفيذ قبل اكتمال الأدلة والاعتماد.", "A controlled launch flow that cannot enter execution before evidence and approval are complete."],
};

function flow(group: ProjectFlowGroup, path: string, title: readonly [string, string], kind: string, focus: ProjectFocus): ProjectFlowDefinition {
  return { description: descriptions[group], focus, group, kind, route: `/projects/${group}/${path}`, title };
}

export const projectFlowDefinitions: readonly ProjectFlowDefinition[] = [
  flow("analysis", "new", ["تحليل مشروع — إدخال البيانات", "Project analysis — input"], "form", "create"),
  flow("analysis", "progress", ["تحليل مشروع — جاري التحليل", "Project analysis — progress"], "progress", "workflow"),
  flow("analysis", "result", ["نتيجة تحليل المشروع", "Project analysis result"], "dashboard", "assessment"),
  flow("analysis", "details", ["تفاصيل تحليل السوق", "Market analysis details"], "detail", "assessment"),
  flow("analysis", "map", ["الخريطة الجغرافية للفرص", "Geographic opportunity map"], "map", "intelligence"),
  flow("analysis", "recommendations", ["الرؤى والتوصيات", "Insights and recommendations"], "detail", "governance"),
  flow("analysis", "report", ["تقرير تحليل المشروع", "Project analysis report"], "report", "report"),
  flow("evaluation", "new", ["تقييم مشروع — إدخال البيانات", "Project evaluation — input"], "form", "assessment"),
  flow("evaluation", "progress", ["تقييم مشروع — جاري التقييم", "Project evaluation — progress"], "progress", "workflow"),
  flow("evaluation", "result", ["نتيجة تقييم المشروع", "Project evaluation result"], "dashboard", "assessment"),
  flow("evaluation", "details", ["تفاصيل نقاط التقييم", "Evaluation score details"], "detail", "assessment"),
  flow("evaluation", "risks", ["تحليل المخاطر والعائد", "Risk and return analysis"], "dashboard", "risk"),
  flow("evaluation", "recommendations", ["التوصيات النهائية", "Final recommendations"], "detail", "governance"),
  flow("evaluation", "report", ["تقرير تقييم المشروع", "Project evaluation report"], "report", "report"),
  flow("start", "new", ["بدء مشروع — بيانات البداية", "Start project — input"], "form", "create"),
  flow("start", "roadmap", ["خارطة تنفيذ المشروع", "Project delivery roadmap"], "timeline", "workflow"),
  flow("start", "licenses", ["التراخيص والإجراءات", "Licenses and procedures"], "checklist", "compliance"),
  flow("start", "setup", ["التجهيز والميزانية", "Setup and budget"], "dashboard", "feasibility"),
  flow("start", "team", ["الفريق والمهام", "Team and tasks"], "dashboard", "team"),
  flow("start", "vendors", ["الموردون والشركاء", "Vendors and partners"], "list", "vendors"),
  flow("start", "launch", ["الإطلاق والنمو", "Launch and growth"], "dashboard", "launch"),
  flow("start", "report", ["تقرير خطة بدء المشروع", "Project launch plan report"], "report", "report"),
  flow("feasibility", "simple/new", ["الدراسة المبسطة — البيانات", "Simplified study — input"], "form", "feasibility"),
  flow("feasibility", "simple/result", ["نتيجة الدراسة المبسطة", "Simplified study result"], "dashboard", "feasibility"),
  flow("feasibility", "simple/report", ["تقرير الدراسة المبسطة", "Simplified study report"], "report", "report"),
  flow("feasibility", "pro/new", ["الدراسة الاحترافية — البداية", "Professional study — start"], "wizard", "feasibility"),
  flow("feasibility", "pro/market", ["الدراسة السوقية", "Market study"], "dashboard", "intelligence"),
  flow("feasibility", "pro/financial", ["الدراسة المالية", "Financial study"], "dashboard", "feasibility"),
  flow("feasibility", "pro/technical", ["الدراسة الفنية والتقنية", "Technical study"], "detail", "assessment"),
  flow("feasibility", "pro/operational", ["الدراسة التشغيلية", "Operational study"], "detail", "assessment"),
  flow("feasibility", "pro/swot", ["SWOT والمخاطر والحساسية", "SWOT, risk, and sensitivity"], "dashboard", "risk"),
  flow("feasibility", "pro/timeline", ["الجدول الزمني والتنفيذ", "Timeline and delivery"], "timeline", "workflow"),
  flow("feasibility", "pro/result", ["النتيجة الاحترافية", "Professional study result"], "dashboard", "feasibility"),
  flow("feasibility", "pro/report", ["تقرير الدراسة الاحترافية", "Professional study report"], "report", "report"),
];

const professionalMarketingFlow: ProjectFlowDefinition = flow(
  "feasibility",
  "pro/marketing",
  ["الخطة التسويقية", "Marketing plan"],
  "wizard",
  "feasibility",
);
const analysisPrintFlow: ProjectFlowDefinition = flow(
  "analysis",
  "print",
  ["طباعة وتصدير تحليل المشروع", "Print and export project analysis"],
  "report",
  "report",
);

const supplementalProjectFlows = [
  professionalMarketingFlow,
  analysisPrintFlow,
] as const;

export function findProjectFlow(route: string) {
  return (
    projectFlowDefinitions.find((item) => item.route === route) ??
    supplementalProjectFlows.find((item) => item.route === route)
  );
}