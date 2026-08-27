import { cache } from "react";

import type { IconName } from "@/components/ui/icons";
import type { ServiceTemplateKey } from "@/lib/platform/service-templates";

export type CatalogCopy = readonly [ar: string, en: string];

export interface PlatformServiceDefinition {
  description: CatalogCopy;
  href: string;
  icon: IconName;
  id: string;
  previewHref?: string;
  slug: string;
  template: ServiceTemplateKey;
  title: CatalogCopy;
}

export interface PlatformModuleDefinition {
  code: string;
  description: CatalogCopy;
  eyebrow: CatalogCopy;
  icon: IconName;
  id: string;
  previewHref?: string;
  route: string;
  scene:
    | "dashboard"
    | "projects"
    | "academy"
    | "talent"
    | "market"
    | "software"
    | "programs"
    | "marketing";
  services: readonly PlatformServiceDefinition[];
  signature: CatalogCopy;
  stages: readonly CatalogCopy[];
  title: CatalogCopy;
}

export interface PlatformCatalogSnapshot {
  modules: readonly PlatformModuleDefinition[];
  sourceState: "preview-catalog" | "connected";
  version: number;
}

export interface PlatformCatalogProvider {
  readonly id: string;
  read(): Promise<PlatformCatalogSnapshot>;
}

const service = (
  moduleId: string,
  slug: string,
  icon: IconName,
  title: CatalogCopy,
  description: CatalogCopy,
  hrefOrOptions:
    | string
    | { href?: string; previewHref?: string; template?: ServiceTemplateKey } = {},
): PlatformServiceDefinition => ({
  description,
  href:
    typeof hrefOrOptions === "string"
      ? hrefOrOptions
      : hrefOrOptions.href ?? `/${moduleId}/${slug}`,
  icon,
  id: `${moduleId}.${slug}`,
  previewHref:
    typeof hrefOrOptions === "string" ? undefined : hrefOrOptions.previewHref,
  slug,
  template:
    typeof hrefOrOptions === "string"
      ? "catalog-service"
      : hrefOrOptions.template ?? "catalog-service",
  title,
});

const modules: readonly PlatformModuleDefinition[] = [
  {
    id: "dashboard",
    route: "/dashboard",
    code: "GLOBAL / 00",
    icon: "globe",
    scene: "dashboard",
    title: ["مركز أعمالك العالمي", "Your global business command"],
    eyebrow: ["منصة جنان الموحدة", "Unified Jenan platform"],
    signature: ["منظومة واحدة، رؤية كاملة", "One ecosystem, complete vision"],
    description: [
      "بوابة واحدة للأقسام الرئيسية، بهوية موحدة ومساحات قابلة للتوسع من الكتالوج المركزي.",
      "One gateway to every main section, with a unified identity and catalog-driven spaces.",
    ],
    stages: [
      ["اختر القسم", "Choose section"],
      ["استكشف الخدمات", "Explore services"],
      ["افتح مساحة العمل", "Open workspace"],
      ["خصص لاحقًا", "Configure later"],
    ],
    services: [
      service(
        "dashboard",
        "projects",
        "briefcase",
        ["المشاريع", "Projects"],
        [
          "تحليل المشروع ودراسة الجدوى والتقييم والبدء.",
          "Project analysis, feasibility, evaluation, and launch.",
        ],
        "/projects",
      ),
      service(
        "dashboard",
        "academy",
        "graduation",
        ["أكاديمية جنان", "Jenan Academy"],
        [
          "دراسات وندوات وأبحاث ودورات دراسية.",
          "Studies, seminars, research, and courses.",
        ],
        "/academy",
      ),
      service(
        "dashboard",
        "market",
        "cart",
        ["سوق جنان", "Jenan Market"],
        [
          "واجهات لبيع المشاريع والأنشطة.",
          "Interfaces for projects and businesses for sale.",
        ],
        "/market",
      ),
      service(
        "dashboard",
        "talent",
        "people",
        ["وظيفتي", "My Career"],
        [
          "مساحتان للباحث عن وظيفة والمنشأة الباحثة عن موظفين.",
          "Two spaces for job seekers and hiring organizations.",
        ],
        "/talent",
      ),
      service(
        "dashboard",
        "software",
        "settings",
        ["البرمجيات", "Software"],
        [
          "أدوات المستندات والتصميم المهني.",
          "Document tools and professional design.",
        ],
        "/software",
      ),
      service(
        "dashboard",
        "programs",
        "grid",
        ["برامج جنان للمنشآت", "Jenan Programs for Organizations"],
        [
          "برامج مساندة للموارد والمحاسبة والميدان والأسطول.",
          "Support programs for people, finance, field teams, and fleets.",
        ],
        "/programs",
      ),
      service(
        "dashboard",
        "marketing",
        "sparkles",
        ["التسويق والإعلان", "Marketing & Advertising"],
        [
          "تسويق المشاريع والأنشطة وجذب العملاء.",
          "Project, business, and customer acquisition marketing.",
        ],
        "/marketing",
      ),
    ],
  },
  {
    id: "projects",
    previewHref: "/projects-showcase-review",
    route: "/projects",
    code: "BUILD / 01",
    icon: "building",
    scene: "projects",
    title: ["قسم المشاريع", "Projects"],
    eyebrow: ["من الفكرة إلى بداية المشروع", "From idea to project launch"],
    signature: ["مشروع أوضح، قرار أفضل", "Clearer project, better decision"],
    description: [
      "أربع واجهات متخصصة لفهم المشروع ودراسة جدواه وتقييمه ثم بدء مساحته.",
      "Four focused interfaces to analyze, study, evaluate, and start a project.",
    ],
    stages: [
      ["تحليل", "Analyze"],
      ["دراسة", "Study"],
      ["تقييم", "Evaluate"],
      ["بدء", "Start"],
    ],
    services: [
      service(
        "projects",
        "analysis",
        "barChart",
        ["تحليل مشروع", "Project analysis"],
        [
          "واجهة لتنظيم فكرة المشروع وعناصرها الأساسية.",
          "An interface for structuring the project idea and its essentials.",
        ],
        { previewHref: "/projects-analysis-review", template: "projects-analysis" },
      ),
      service(
        "projects",
        "feasibility-study",
        "pieChart",
        ["إعداد دراسة جدوى", "Feasibility study"],
        [
          "شاشة مرتبة لأقسام دراسة الجدوى ومخرجاتها.",
          "A structured screen for feasibility study sections and outputs.",
        ],
        { previewHref: "/projects-feasibility-review", template: "projects-feasibility" },
      ),
      service(
        "projects",
        "evaluation",
        "activity",
        ["تقييم مشروع", "Project evaluation"],
        [
          "واجهة تعرض محاور التقييم والملخصات دون تشغيل التحليل.",
          "An interface presenting evaluation dimensions without running analysis.",
        ],
        { previewHref: "/projects-evaluation-review", template: "projects-evaluation" },
      ),
      service(
        "projects",
        "start",
        "rocket",
        ["بدء مشروع", "Start a project"],
        [
          "مساحة بصرية لتهيئة المشروع ومراحله الأولى.",
          "A visual space for preparing the project and its first stages.",
        ],
        { previewHref: "/projects-start-review", template: "projects-launch" },
      ),
    ],
  },
  {
    id: "academy",
    previewHref: "/academy-showcase-review",
    route: "/academy",
    code: "LEARN / 02",
    icon: "graduation",
    scene: "academy",
    title: ["أكاديمية جنان", "Jenan Academy"],
    eyebrow: ["معرفة تتطور مع الأعمال", "Knowledge that evolves with business"],
    signature: [
      "المعرفة مفتاح تحقيق أحلامك وبوابة المستقبل",
      "Knowledge is the key to your dreams and the gateway to the future",
    ],
    description: [
      "واجهات للدراسات والندوات والأبحاث والدورات الدراسية ضمن بيئة تعليمية واحدة.",
      "Interfaces for studies, seminars, research, and courses in one learning environment.",
    ],
    stages: [
      ["اكتشاف", "Discover"],
      ["تعلّم", "Learn"],
      ["ناقش", "Discuss"],
      ["طور", "Advance"],
    ],
    services: [
      service(
        "academy",
        "studies",
        "briefcase",
        ["الدراسات", "Studies"],
        [
          "مكتبة واجهات للدراسات المتخصصة والمنظمة.",
          "A structured interface library for specialized studies.",
        ],
        { previewHref: "/academy-studies-review", template: "academy-studies" },
      ),
      service(
        "academy",
        "seminars",
        "people",
        ["الندوات", "Seminars"],
        [
          "شاشات للندوات والمحاور والمتحدثين.",
          "Screens for seminars, themes, and speakers.",
        ],
        { previewHref: "/academy-path-review/seminars", template: "academy-seminars" },
      ),
      service(
        "academy",
        "research",
        "search",
        ["الأبحاث", "Research"],
        [
          "مساحة لاستكشاف الأبحاث وتصنيفها وعرضها.",
          "A space to discover, categorize, and present research.",
        ],
        { previewHref: "/academy-path-review/research", template: "academy-research" },
      ),
      service(
        "academy",
        "courses",
        "graduation",
        ["الدورات الدراسية", "Courses"],
        [
          "واجهات لمسارات الدورات والمواد والمستويات.",
          "Interfaces for course tracks, materials, and levels.",
        ],
        { previewHref: "/academy-path-review/courses", template: "academy-courses" },
      ),
    ],
  },
  {
    id: "market",
    route: "/market",
    code: "TRADE / 03",
    icon: "cart",
    scene: "market",
    title: ["سوق جنان", "Jenan Market"],
    eyebrow: [
      "مشاريع وأنشطة تبحث عن فرصتها",
      "Projects and businesses seeking opportunity",
    ],
    signature: ["فرص موثوقة بلا حدود", "Trusted opportunity without borders"],
    description: [
      "واجهات عرض منظمة للمشاريع والأنشطة المعروضة للبيع دون تشغيل التعاملات.",
      "Organized showcase interfaces for projects and businesses for sale, without transactions.",
    ],
    stages: [
      ["استكشف", "Explore"],
      ["قارن", "Compare"],
      ["راجع", "Review"],
      ["تواصل لاحقًا", "Connect later"],
    ],
    services: [
      service(
        "market",
        "projects-for-sale",
        "briefcase",
        ["مشاريع للبيع", "Projects for sale"],
        [
          "واجهة تعرض المشاريع المصنفة وتفاصيلها البصرية.",
          "An interface presenting categorized projects and visual details.",
        ],
      ),
      service(
        "market",
        "businesses-for-sale",
        "building",
        ["أنشطة للبيع", "Businesses for sale"],
        [
          "واجهة للأنشطة والمنشآت المعروضة للبيع.",
          "An interface for businesses and organizations offered for sale.",
        ],
      ),
    ],
  },
  {
    id: "talent",
    route: "/talent",
    code: "CAREER / 04",
    icon: "people",
    scene: "talent",
    title: ["وظيفتي", "My Career"],
    eyebrow: [
      "الفرصة والكفاءة في مكان واحد",
      "Opportunity and capability in one place",
    ],
    signature: ["المهارة في مدارها الصحيح", "Capability in the right orbit"],
    description: [
      "مساحتان منفصلتان للباحث عن وظيفة وللمنشأة الباحثة عن موظفين.",
      "Two distinct spaces for job seekers and organizations looking for employees.",
    ],
    stages: [
      ["أنشئ المساحة", "Create space"],
      ["اعرض الخبرة", "Present experience"],
      ["استكشف", "Explore"],
      ["تواصل لاحقًا", "Connect later"],
    ],
    services: [
      service(
        "talent",
        "job-seeker",
        "user",
        ["طالب وظيفة", "Job seeker"],
        [
          "صفحة مهنية للملف والسيرة الذاتية واستكشاف الفرص.",
          "A professional page for profiles, resumes, and opportunity discovery.",
        ],
      ),
      service(
        "talent",
        "hiring-organization",
        "building",
        ["منشأة تبحث عن موظفين", "Hiring organization"],
        [
          "صفحة للمنشأة واحتياجاتها والبحث في السير الذاتية.",
          "A page for organization needs and resume discovery.",
        ],
      ),
    ],
  },
  {
    id: "software",
    route: "/software",
    code: "TOOLS / 05",
    icon: "settings",
    scene: "software",
    title: ["البرمجيات", "Software"],
    eyebrow: [
      "أدوات عملية بهوية احترافية",
      "Practical tools with a professional identity",
    ],
    signature: ["أدوات تنجز وتصمم", "Tools that deliver and design"],
    description: [
      "قسمان لواجهات أدوات المستندات والتصميم والإعداد المهني.",
      "Two interface groups for document tools and professional design.",
    ],
    stages: [
      ["اختر الأداة", "Choose tool"],
      ["جهز المحتوى", "Prepare content"],
      ["راجع التصميم", "Review design"],
      ["صدر لاحقًا", "Export later"],
    ],
    services: [
      service(
        "software",
        "document-tools",
        "grid",
        ["أدوات PDF والمستندات", "PDF & document tools"],
        [
          "واجهة تجمع أدوات PDF والمستندات والخدمات المرتبطة بها.",
          "An interface gathering PDF, document, and related tools.",
        ],
      ),
      service(
        "software",
        "professional-design",
        "sparkles",
        ["التصميم والإعداد المهني", "Professional design & preparation"],
        [
          "واجهات للسيرة الذاتية والورق الرسمي والخطابات وغيرها.",
          "Interfaces for resumes, letterheads, letters, and more.",
        ],
      ),
    ],
  },
  {
    id: "programs",
    route: "/programs",
    code: "OPERATE / 06",
    icon: "grid",
    scene: "programs",
    title: ["برامج جنان للمنشآت", "Jenan Programs for Organizations"],
    eyebrow: [
      "برامج مساندة لإدارة المنشأة",
      "Support programs for organization operations",
    ],
    signature: [
      "تشغيل منظم، رؤية أوضح",
      "Organized operations, clearer vision",
    ],
    description: [
      "واجهات برامج داخلية وخارجية مساندة للمنشآت دون تشغيل وظائفها الآن.",
      "Interfaces for internal and external organization support programs, without active operations.",
    ],
    stages: [
      ["اختر البرنامج", "Choose program"],
      ["هيئ المساحة", "Configure space"],
      ["راجع الأقسام", "Review sections"],
      ["فعّل لاحقًا", "Activate later"],
    ],
    services: [
      service(
        "programs",
        "human-resources",
        "people",
        ["الموارد البشرية", "Human resources"],
        [
          "واجهة داخلية لصفحات وملفات الموارد البشرية.",
          "An internal interface for human resources pages and records.",
        ],
      ),
      service(
        "programs",
        "accounting",
        "wallet",
        ["المحاسبة", "Accounting"],
        [
          "شاشات منظمة لواجهات الحسابات والملخصات المالية.",
          "Structured screens for accounting and financial summaries.",
        ],
      ),
      service(
        "programs",
        "field-representatives",
        "activity",
        ["متابعة المناديب", "Representative tracking"],
        [
          "واجهة بصرية لمتابعة فرق الميدان والمناديب.",
          "A visual interface for field teams and representatives.",
        ],
      ),
      service(
        "programs",
        "fleet",
        "globe",
        ["إدارة الأسطول", "Fleet management"],
        [
          "شاشات لعرض المركبات والمسارات وحالة الأسطول.",
          "Screens for vehicles, routes, and fleet status.",
        ],
      ),
    ],
  },
  {
    id: "marketing",
    route: "/marketing",
    code: "SIGNAL / 07",
    icon: "sparkles",
    scene: "marketing",
    title: ["التسويق والإعلان", "Marketing & Advertising"],
    eyebrow: ["وصول أذكى لكل فرصة", "Smarter reach for every opportunity"],
    signature: ["إشارة واضحة تصل بثقة", "A clear signal, delivered with trust"],
    description: [
      "ثلاث واجهات لتسويق المشاريع والأنشطة المعروضة للبيع وجذب عملاء النشاط.",
      "Three interfaces for project marketing, business-sale marketing, and customer acquisition.",
    ],
    stages: [
      ["حدد الهدف", "Set objective"],
      ["اختر الجمهور", "Choose audience"],
      ["صمم الواجهة", "Design experience"],
      ["انشر لاحقًا", "Publish later"],
    ],
    services: [
      service(
        "marketing",
        "projects",
        "briefcase",
        ["تسويق المشاريع", "Project marketing"],
        [
          "واجهة لعرض هوية المشروع ورسائله التسويقية.",
          "An interface for presenting project identity and marketing messages.",
        ],
      ),
      service(
        "marketing",
        "businesses-for-sale",
        "building",
        ["تسويق الأنشطة للبيع", "Business-sale marketing"],
        [
          "واجهة لتقديم النشاط المعروض للبيع بصورة احترافية.",
          "An interface for professionally presenting a business for sale.",
        ],
      ),
      service(
        "marketing",
        "customer-acquisition",
        "trend",
        ["إعلانات جذب العملاء", "Customer acquisition ads"],
        [
          "واجهات إعلانية لجذب عملاء وزبائن النشاط كالمطاعم وغيرها.",
          "Advertising interfaces for attracting customers to restaurants and other businesses.",
        ],
      ),
    ],
  },
];

export const builtInPlatformCatalog: PlatformCatalogSnapshot = {
  modules,
  sourceState: "preview-catalog",
  version: 1,
};

const builtInProvider: PlatformCatalogProvider = {
  id: "built-in-preview",
  async read() {
    return builtInPlatformCatalog;
  },
};

let activeProvider: PlatformCatalogProvider = builtInProvider;

export function registerPlatformCatalogProvider(
  provider: PlatformCatalogProvider,
) {
  activeProvider = provider;
}

export const readPlatformCatalog = cache(async () => activeProvider.read());

export async function findPlatformModule(routeOrId: string) {
  const snapshot = await readPlatformCatalog();
  const normalized = routeOrId.startsWith("/") ? routeOrId : `/${routeOrId}`;
  return snapshot.modules.find(
    (module) => module.route === normalized || module.id === routeOrId,
  );
}

export async function findPlatformService(moduleId: string, slug: string) {
  const catalogModule = await findPlatformModule(moduleId);
  const service = catalogModule?.services.find((item) => item.slug === slug);
  return catalogModule && service ? { module: catalogModule, service } : null;
}
