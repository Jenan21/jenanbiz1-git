export type InterfaceVisibilityLevel = "section" | "service";

export type InterfaceVisibilityItem = {
  group: string;
  label: readonly [string, string];
  level: InterfaceVisibilityLevel;
  path: string;
};

const groupLabels = {
  projects: ["المشاريع", "Projects"],
  academy: ["الأكاديمية", "Academy"],
  software: ["البرمجيات والأدوات", "Software and tools"],
  talent: ["التوظيف", "Talent"],
  market: ["سوق جنان", "Jenan Market"],
  marketing: ["التسويق", "Marketing"],
  robotics: ["الروبوتات", "Robotics"],
  programs: ["منظومة التشغيل", "Operations suite"],
  studio: ["الأدوات القديمة", "Legacy tools"],
} as const;

export const INTERFACE_VISIBILITY_GROUPS = Object.entries(groupLabels).map(([id, label]) => ({ id, label }));

const section = (group: string, path: string, label: readonly [string, string]): InterfaceVisibilityItem => ({ group, label, level: "section", path });
const service = (group: string, path: string, label: readonly [string, string]): InterfaceVisibilityItem => ({ group, label, level: "service", path });

export const PERSONALIZABLE_INTERFACE_ITEMS: readonly InterfaceVisibilityItem[] = [
  section("projects", "/projects", ["قسم المشاريع", "Projects section"]),
  service("projects", "/projects/analysis", ["تحليل مشروع", "Project analysis"]),
  service("projects", "/projects/feasibility", ["دراسات الجدوى", "Feasibility studies"]),
  service("projects", "/projects/start", ["بدء مشروع", "Start project"]),
  service("projects", "/projects/start/evaluation", ["تقييم المشروع", "Project evaluation"]),

  section("academy", "/academy", ["أكاديمية المستخدم", "User academy"]),
  service("academy", "/academy/courses", ["الدورات", "Courses"]),
  service("academy", "/academy/sections", ["أقسام الأكاديمية", "Academy sections"]),
  service("academy", "/academy/paths", ["المسارات التعليمية", "Learning paths"]),
  service("academy", "/academy/webinars", ["الندوات", "Webinars"]),
  service("academy", "/academy/studies", ["الدراسات", "Studies"]),
  service("academy", "/academy/research", ["الأبحاث", "Research"]),
  service("academy", "/academy/library", ["مكتبة الكتب والتقارير", "Books and reports"]),
  service("academy", "/academy/journey", ["رحلتي التعليمية", "Learning journey"]),
  service("academy", "/academy/assessments", ["الاختبارات والتقييمات", "Assessments"]),
  service("academy", "/academy/obligations", ["الالتزامات والواجبات", "Learning obligations"]),
  service("academy", "/academy/certificates", ["الشهادات", "Certificates"]),
  service("academy", "/academy/downloads", ["المكتبة والتنزيلات", "Downloads"]),
  service("academy", "/academy/community", ["مجتمع الأكاديمية", "Academy community"]),
  service("academy", "/academy/search", ["بحث الأكاديمية", "Academy search"]),
  service("academy", "/academy/profile", ["الملف الأكاديمي", "Academic profile"]),
  service("academy", "/academy/settings", ["إعدادات الأكاديمية", "Academy settings"]),

  section("software", "/software", ["قسم البرمجيات", "Software section"]),
  service("software", "/software/files", ["أدوات الملفات", "File tools"]),
  service("software", "/software/files/images-to-pdf", ["الصور إلى PDF", "Images to PDF"]),
  service("software", "/software/files/merge-pdf", ["دمج PDF", "Merge PDF"]),
  service("software", "/software/files/split-pdf", ["تقسيم PDF", "Split PDF"]),
  service("software", "/software/files/compress-pdf", ["تحسين PDF", "Optimize PDF"]),
  service("software", "/software/files/word-to-pdf", ["Word إلى PDF", "Word to PDF"]),
  service("software", "/software/files/pdf-to-word", ["PDF إلى Word", "PDF to Word"]),
  service("software", "/software/files/pdf-to-excel", ["PDF إلى Excel", "PDF to Excel"]),
  service("software", "/software/files/excel-to-pdf", ["Excel إلى PDF", "Excel to PDF"]),
  service("software", "/software/design", ["استوديو التصميم", "Design studio"]),
  service("software", "/software/design/logo", ["تصميم الشعار", "Logo design"]),
  service("software", "/software/design/letterhead", ["الورق الرسمي", "Letterhead"]),
  service("software", "/software/design/cv", ["منشئ السيرة الذاتية", "CV builder"]),
  service("software", "/software/design/docs", ["المستندات وملف الشركة", "Documents and company profiles"]),
  service("software", "/software/design/presentations", ["العروض التقديمية", "Presentations"]),
  service("software", "/software/design/history", ["سجل التصاميم", "Design history"]),
  service("software", "/software/business", ["إدارة الأعمال", "Business suite"]),
  service("software", "/software/sales", ["المبيعات", "Sales"]),
  service("software", "/software/accounting", ["المحاسبة", "Accounting"]),
  service("software", "/software/hr", ["الموارد البشرية", "Human resources"]),
  service("software", "/software/inventory", ["المخزون", "Inventory"]),
  service("software", "/software/crm", ["إدارة علاقات العملاء", "CRM"]),
  service("software", "/software/projects", ["إدارة المشاريع التشغيلية", "Operational projects"]),
  service("software", "/software/pos", ["نقاط البيع", "Point of sale"]),
  service("software", "/software/purchases", ["المشتريات", "Purchases"]),
  service("software", "/software/company", ["إدارة الشركات", "Company management"]),
  service("software", "/software/reports", ["تقارير إدارة الأعمال", "Business reports"]),

  section("talent", "/talent", ["قسم التوظيف", "Talent section"]),
  service("talent", "/talent/jobs", ["البحث عن وظائف", "Find jobs"]),
  service("talent", "/talent/jobs/saved", ["الوظائف المحفوظة", "Saved jobs"]),
  service("talent", "/talent/applications", ["طلبات التوظيف", "Applications"]),
  service("talent", "/talent/profile", ["الملف المهني", "Professional profile"]),
  service("talent", "/talent/interviews", ["المقابلات", "Interviews"]),
  service("talent", "/talent/messages", ["الرسائل", "Messages"]),
  service("talent", "/talent/matching", ["المطابقة الذكية", "Smart matching"]),
  service("talent", "/talent/employer", ["لوحة صاحب العمل", "Employer dashboard"]),
  service("talent", "/talent/employer/jobs", ["إدارة الوظائف", "Manage jobs"]),
  service("talent", "/talent/employer/search", ["البحث عن المرشحين", "Candidate search"]),
  service("talent", "/talent/employer/shortlists", ["القوائم المختصرة", "Shortlists"]),
  service("talent", "/talent/employer/applicants", ["إدارة المتقدمين", "Manage applicants"]),
  service("talent", "/talent/employer/pipeline", ["مراحل التوظيف", "Hiring pipeline"]),
  service("talent", "/talent/employer/reports", ["تقارير التوظيف", "Hiring reports"]),

  section("market", "/market", ["سوق جنان", "Jenan Market"]),
  service("market", "/market/listings", ["العروض", "Listings"]),
  service("market", "/market/sell", ["إنشاء إعلان بيع", "Create sale listing"]),
  service("market", "/market/sell/media", ["صور ومستندات الإعلان", "Listing media"]),
  service("market", "/market/sell/review", ["مراجعة ونشر الإعلان", "Review and publish"]),

  section("marketing", "/marketing", ["قسم التسويق", "Marketing section"]),
  service("marketing", "/marketing/campaigns", ["الحملات", "Campaigns"]),
  service("marketing", "/marketing/campaign/new", ["إنشاء حملة", "Create campaign"]),
  service("marketing", "/marketing/audience", ["الجمهور", "Audience"]),
  service("marketing", "/marketing/channels", ["القنوات", "Channels"]),
  service("marketing", "/marketing/leads", ["العملاء المحتملون", "Leads"]),
  service("marketing", "/marketing/analytics", ["تحليلات التسويق", "Marketing analytics"]),

  section("robotics", "/robotics", ["قسم الروبوتات", "Robotics section"]),
  service("robotics", "/robotics/search", ["البحث عن روبوت", "Find a robot"]),
  service("robotics", "/robotics/results", ["نتائج البحث", "Robot results"]),
  service("robotics", "/robotics/recommendations", ["توصيات الروبوتات", "Robot recommendations"]),

  section("programs", "/programs", ["منظومة التشغيل", "Operations suite"]),
  service("programs", "/programs/people", ["إدارة الفريق", "People"]),
  service("programs", "/programs/finance", ["الدفتر المالي", "Finance"]),
  service("programs", "/programs/field", ["العمليات الميدانية", "Field operations"]),
  service("programs", "/programs/fleet", ["إدارة الأسطول", "Fleet"]),

  section("studio", "/studio", ["الأدوات التقليدية", "Legacy tools"]),
  service("studio", "/studio/pdf", ["Jenan PDF", "Jenan PDF"]),
  service("studio", "/studio/docs", ["Jenan Docs", "Jenan Docs"]),
  service("studio", "/studio/sheets", ["Jenan Sheets", "Jenan Sheets"]),
  service("studio", "/studio/presentations", ["Jenan Presentations", "Jenan Presentations"]),
  service("studio", "/studio/logo", ["الشعار والهوية", "Logo and brand"]),
  service("studio", "/studio/letterhead", ["الورق الرسمي", "Letterhead"]),
  service("studio", "/studio/cv", ["السيرة الذاتية", "CV builder"]),
  service("studio", "/studio/history", ["سجل الملفات", "File history"]),
];

export const PERSONALIZABLE_INTERFACE_PATHS = new Set(PERSONALIZABLE_INTERFACE_ITEMS.map((item) => item.path));

export function normalizeHiddenInterfacePaths(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((path): path is string => typeof path === "string" && PERSONALIZABLE_INTERFACE_PATHS.has(path)))].sort();
}
