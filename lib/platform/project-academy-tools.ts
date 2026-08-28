import type { IconName } from "@/components/ui/icons";
import { findPlatformService } from "@/lib/platform/catalog";

export type ToolCopy = readonly [ar: string, en: string];

export interface ServiceToolDefinition {
  code: string;
  description: ToolCopy;
  icon: IconName;
  slug: string;
  title: ToolCopy;
}

export interface ServiceToolSuite {
  inputs: readonly ToolCopy[];
  moduleId: "projects" | "academy";
  serviceSlug: string;
  tools: readonly ServiceToolDefinition[];
  workflow: readonly ToolCopy[];
}

const tool = (
  slug: string,
  code: string,
  icon: IconName,
  title: ToolCopy,
  description: ToolCopy,
): ServiceToolDefinition => ({ slug, code, icon, title, description });

const projectWorkflow = [
  ["تعريف النطاق", "Define scope"],
  ["تنظيم المدخلات", "Structure inputs"],
  ["مراجعة التصور", "Review concept"],
  ["اعتماد لاحق", "Future approval"],
] as const;

const academyWorkflow = [
  ["اكتشاف المحتوى", "Discover content"],
  ["تنظيم المسار", "Structure path"],
  ["مراجعة معرفية", "Knowledge review"],
  ["نشر لاحق", "Future publishing"],
] as const;

export const projectAcademyToolSuites: readonly ServiceToolSuite[] = [
  {
    moduleId: "projects",
    serviceSlug: "analysis",
    inputs: [
      ["فكرة المشروع", "Project idea"],
      ["القطاع المستهدف", "Target sector"],
      ["السوق الجغرافي", "Geographic market"],
      ["مرحلة المشروع", "Project stage"],
    ],
    workflow: projectWorkflow,
    tools: [
      tool(
        "concept-brief",
        "IDEA / 01",
        "sparkles",
        ["موجز الفكرة", "Concept brief"],
        [
          "تنظيم المشكلة والحل والقيمة المقترحة في لوحة واحدة.",
          "Structure the problem, solution, and value proposition in one canvas.",
        ],
      ),
      tool(
        "market-lens",
        "MARKET / 02",
        "trend",
        ["عدسة السوق", "Market lens"],
        [
          "تصور الجمهور والبدائل والفرصة السوقية.",
          "Preview the audience, alternatives, and market opportunity.",
        ],
      ),
      tool(
        "operating-model",
        "OPS / 03",
        "settings",
        ["نموذج التشغيل", "Operating model"],
        [
          "ترتيب الموارد والمسار والاعتماديات التشغيلية.",
          "Arrange resources, delivery paths, and operating dependencies.",
        ],
      ),
      tool(
        "risk-map",
        "RISK / 04",
        "shield",
        ["خريطة المخاطر", "Risk map"],
        [
          "واجهة لتجميع الافتراضات والعوائق وخطط الاستجابة.",
          "A surface for assumptions, blockers, and response planning.",
        ],
      ),
    ],
  },
  {
    moduleId: "projects",
    serviceSlug: "feasibility-study",
    inputs: [
      ["المشروع والقطاع", "Project and sector"],
      ["السوق المستهدف", "Target market"],
      ["حجم التشغيل", "Operating scale"],
      ["الأفق الزمني", "Planning horizon"],
    ],
    workflow: projectWorkflow,
    tools: [
      tool(
        "market-viability",
        "MARKET / 01",
        "barChart",
        ["جدوى السوق", "Market viability"],
        [
          "لوحة فرضيات الطلب والحجم والمنافسة.",
          "A canvas for demand, size, and competition assumptions.",
        ],
      ),
      tool(
        "revenue-model",
        "MODEL / 02",
        "wallet",
        ["نموذج الإيراد", "Revenue model"],
        [
          "واجهة لمصادر الدخل والتسعير والتدفقات.",
          "An interface for income streams, pricing, and flows.",
        ],
      ),
      tool(
        "cost-structure",
        "COST / 03",
        "pieChart",
        ["هيكل التكاليف", "Cost structure"],
        [
          "تنظيم تكاليف التأسيس والتشغيل والموارد.",
          "Structure setup, operating, and resource costs.",
        ],
      ),
      tool(
        "decision-gate",
        "GATE / 04",
        "check",
        ["بوابة القرار", "Decision gate"],
        [
          "ملخص بصري للفرضيات والبدائل وحالة القرار.",
          "A visual summary of assumptions, options, and decision state.",
        ],
      ),
    ],
  },
  {
    moduleId: "projects",
    serviceSlug: "evaluation",
    inputs: [
      ["ملخص المشروع", "Project summary"],
      ["مرحلة المشروع", "Project stage"],
      ["السوق والقطاع", "Market and sector"],
      ["أدلة الجاهزية", "Readiness evidence"],
    ],
    workflow: projectWorkflow,
    tools: [
      tool(
        "value-scorecard",
        "VALUE / 01",
        "trend",
        ["بطاقة القيمة", "Value scorecard"],
        [
          "تصور الأثر والميزة والقيمة المتوقعة.",
          "Preview impact, advantage, and expected value.",
        ],
      ),
      tool(
        "market-fit",
        "FIT / 02",
        "pieChart",
        ["ملاءمة السوق", "Market fit"],
        [
          "تنظيم الحاجة والجمهور والتوقيت.",
          "Structure need, audience, and timing.",
        ],
      ),
      tool(
        "readiness-review",
        "READY / 03",
        "activity",
        ["مراجعة الجاهزية", "Readiness review"],
        [
          "واجهة للفريق والموارد والمسار التنفيذي.",
          "An interface for team, resources, and delivery path.",
        ],
      ),
      tool(
        "risk-compass",
        "RISK / 04",
        "shield",
        ["بوصلة المخاطر", "Risk compass"],
        [
          "قراءة تصميمية للعوائق والمرونة والبدائل.",
          "A design preview of blockers, resilience, and options.",
        ],
      ),
    ],
  },
  {
    moduleId: "projects",
    serviceSlug: "start",
    inputs: [
      ["اسم المشروع", "Project name"],
      ["مالك المشروع", "Project owner"],
      ["الفريق الأولي", "Initial team"],
      ["نقطة الانطلاق", "Starting point"],
    ],
    workflow: projectWorkflow,
    tools: [
      tool(
        "project-space",
        "SPACE / 01",
        "grid",
        ["مساحة المشروع", "Project space"],
        [
          "تهيئة هوية المشروع ونطاقه وملكيته.",
          "Prepare project identity, scope, and ownership.",
        ],
      ),
      tool(
        "team-builder",
        "TEAM / 02",
        "people",
        ["تشكيل الفريق", "Team builder"],
        [
          "واجهة للأدوار والمسؤوليات وبنية الفريق.",
          "An interface for roles, responsibilities, and team structure.",
        ],
      ),
      tool(
        "first-roadmap",
        "PLAN / 03",
        "activity",
        ["المسار الأول", "First roadmap"],
        [
          "تصور المراحل والمخرجات ونقاط المراجعة.",
          "Preview stages, outcomes, and review points.",
        ],
      ),
      tool(
        "launch-gate",
        "GATE / 04",
        "rocket",
        ["بوابة الانطلاق", "Launch gate"],
        [
          "قائمة جاهزية تصميمية للمراجعة والاعتماد.",
          "A design-only readiness list for review and approval.",
        ],
      ),
    ],
  },
  {
    moduleId: "academy",
    serviceSlug: "studies",
    inputs: [
      ["المجال المعرفي", "Knowledge domain"],
      ["نوع الدراسة", "Study type"],
      ["النطاق الجغرافي", "Geographic scope"],
      ["الأفق الزمني", "Time horizon"],
    ],
    workflow: academyWorkflow,
    tools: [
      tool(
        "strategy-library",
        "STRATEGY / 01",
        "briefcase",
        ["مكتبة الدراسات الاستراتيجية", "Strategy studies library"],
        [
          "واجهة لاستكشاف دراسات القرار والرؤية والتحول.",
          "Explore studies on decisions, vision, and transformation.",
        ],
      ),
      tool(
        "sector-explorer",
        "SECTORS / 02",
        "grid",
        ["مستكشف القطاعات", "Sector explorer"],
        [
          "تصنيف بصري للقطاعات والاتجاهات والفرص.",
          "A visual taxonomy for sectors, trends, and opportunities.",
        ],
      ),
      tool(
        "market-studies",
        "MARKETS / 03",
        "trend",
        ["دراسات الأسواق", "Market studies"],
        [
          "لوحة للحركة والطلب والمنافسة.",
          "A canvas for movement, demand, and competition.",
        ],
      ),
      tool(
        "institutional-insights",
        "ORG / 04",
        "building",
        ["الرؤى المؤسسية", "Institutional insights"],
        [
          "تنظيم موضوعات الكفاءة والهيكلة والتطوير.",
          "Structure capability, organization, and development topics.",
        ],
      ),
    ],
  },
  {
    moduleId: "academy",
    serviceSlug: "seminars",
    inputs: [
      ["محور الندوة", "Seminar theme"],
      ["المتحدثون", "Speakers"],
      ["الجمهور", "Audience"],
      ["موعد البث", "Broadcast time"],
    ],
    workflow: academyWorkflow,
    tools: [
      tool(
        "agenda-builder",
        "THEME / 01",
        "grid",
        ["منظم المحاور", "Agenda builder"],
        [
          "واجهة لبناء المحاور والأسئلة وتسلسل الحوار.",
          "Build themes, questions, and dialogue sequence.",
        ],
      ),
      tool(
        "speaker-room",
        "VOICES / 02",
        "people",
        ["غرفة المتحدثين", "Speaker room"],
        [
          "مساحة تعريفية للخبرات ووجهات النظر.",
          "An identity space for expertise and perspectives.",
        ],
      ),
      tool(
        "audience-map",
        "AUDIENCE / 03",
        "user",
        ["خريطة الجمهور", "Audience map"],
        [
          "تصور شرائح الجمهور واهتماماتها.",
          "Preview audience segments and interests.",
        ],
      ),
      tool(
        "broadcast-preview",
        "LIVE / 04",
        "activity",
        ["معاينة البث", "Broadcast preview"],
        [
          "واجهة مسرح الندوة قبل تفعيل البث.",
          "A seminar stage interface before live broadcast is enabled.",
        ],
      ),
    ],
  },
  {
    moduleId: "academy",
    serviceSlug: "research",
    inputs: [
      ["مجال البحث", "Research field"],
      ["نوع المنهج", "Methodology"],
      ["مصدر الدليل", "Evidence source"],
      ["حالة النشر", "Publication state"],
    ],
    workflow: academyWorkflow,
    tools: [
      tool(
        "research-brief",
        "QUESTION / 01",
        "search",
        ["موجز البحث", "Research brief"],
        [
          "تنظيم السؤال والفرضية ونطاق البحث.",
          "Structure the question, hypothesis, and research scope.",
        ],
      ),
      tool(
        "evidence-library",
        "EVIDENCE / 02",
        "briefcase",
        ["مكتبة الأدلة", "Evidence library"],
        [
          "واجهة للمصادر والمراجع والمواد الموثقة.",
          "An interface for sources, references, and documented material.",
        ],
      ),
      tool(
        "analysis-canvas",
        "INSIGHT / 03",
        "barChart",
        ["لوحة التحليل", "Analysis canvas"],
        [
          "مساحة بصرية للروابط والاستنتاجات.",
          "A visual surface for connections and findings.",
        ],
      ),
      tool(
        "publication-preview",
        "PUBLISH / 04",
        "check",
        ["معاينة النشر", "Publication preview"],
        [
          "قالب لمراجعة البحث قبل النشر المستقبلي.",
          "A template for reviewing research before future publishing.",
        ],
      ),
    ],
  },
  {
    moduleId: "academy",
    serviceSlug: "courses",
    inputs: [
      ["المجال", "Domain"],
      ["المستوى", "Level"],
      ["نمط التعلم", "Learning mode"],
      ["المدة", "Duration"],
    ],
    workflow: academyWorkflow,
    tools: [
      tool(
        "path-planner",
        "PATH / 01",
        "activity",
        ["مخطط المسار", "Path planner"],
        [
          "بناء تصور المراحل والمدة ونقاط التقدم.",
          "Build a preview of stages, duration, and progress points.",
        ],
      ),
      tool(
        "curriculum-map",
        "MATERIAL / 02",
        "grid",
        ["خريطة المنهج", "Curriculum map"],
        [
          "واجهة للوحدات والمواد وتسلسل التعلم.",
          "An interface for units, materials, and learning sequence.",
        ],
      ),
      tool(
        "practice-lab",
        "PRACTICE / 03",
        "settings",
        ["مختبر التطبيق", "Practice lab"],
        [
          "مساحة تمارين وتجارب عملية غير تشغيلية.",
          "A design-only space for exercises and applied work.",
        ],
      ),
      tool(
        "mastery-record",
        "MASTERY / 04",
        "graduation",
        ["سجل الإتقان", "Mastery record"],
        [
          "معاينة الإنجاز والمهارات دون شهادات فعلية.",
          "Preview achievement and skills without issuing credentials.",
        ],
      ),
    ],
  },
] as const;

export function findServiceToolSuite(moduleId: string, serviceSlug: string) {
  return projectAcademyToolSuites.find(
    (suite) => suite.moduleId === moduleId && suite.serviceSlug === serviceSlug,
  );
}

export function resolveServiceToolHref(
  moduleId: string,
  serviceSlug: string,
  toolSlug: string,
  preview = false,
) {
  return preview
    ? `/service-tool-review/${moduleId}/${serviceSlug}/${toolSlug}`
    : `/${moduleId}/${serviceSlug}/${toolSlug}`;
}

export async function getServiceToolDetail(
  moduleId: string,
  serviceSlug: string,
  toolSlug: string,
) {
  const suite = findServiceToolSuite(moduleId, serviceSlug);
  const match = suite ? await findPlatformService(moduleId, serviceSlug) : null;
  const selectedTool = suite?.tools.find((item) => item.slug === toolSlug);
  return suite && match && selectedTool
    ? { ...match, suite, tool: selectedTool }
    : null;
}
