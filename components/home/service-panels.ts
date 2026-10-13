export type Bilingual = readonly [ar: string, en: string];

export type PanelId = "projects" | "academy" | "talent" | "market" | "software" | "marketing" | "tools";

export interface PanelTile {
  readonly label: Bilingual;
  /** One short line under the label (Marketing only); `\n` is a deliberate line break. */
  readonly note?: Bilingual;
  readonly href: string;
}

export interface ServicePanel {
  readonly id: PanelId;
  /** Spoken name of the slide (dots, carousel labels). */
  readonly name: Bilingual;
  /** `*...*` marks the words drawn in the accent colour. */
  readonly headline: Bilingual;
  readonly sub: Bilingual;
  readonly tiles: readonly [PanelTile, PanelTile, PanelTile, PanelTile];
  readonly cta: { readonly label: Bilingual; readonly note?: Bilingual; readonly href: string };
  /** Tile underline colour; the Market design uses gold, every other panel cyan. */
  readonly underline?: "gold";
  /** Marketing keeps its own look from the design: gradient call to action and tiles with a short description. */
  readonly variant?: "marketing";
}

export const BRAND_LEAF_SRC = "/assets/home-panels/brand-leaf.webp";
export const CTA_ROCKET_SRC = "/assets/home-panels/marketing-cta-rocket.webp";
export const sceneSrc = (id: PanelId) => `/assets/home-panels/${id}-scene.webp`;
export const iconSrc = (id: PanelId, position: 1 | 2 | 3 | 4) => `/assets/home-panels/icons/${id}-${position}.webp`;

export interface HeadlinePart {
  readonly text: string;
  readonly accent: boolean;
}

export function splitHeadline(markup: string): HeadlinePart[] {
  return markup
    .split("*")
    .map((text, index) => ({ text, accent: index % 2 === 1 }))
    .filter((part) => part.text.length > 0);
}

const market = (query: Record<string, string>) => `/market/listings?${new URLSearchParams(query).toString()}`;

// The order the panels rotate in. Texts are transcribed from the approved designs (Arabic) and translated (English).
export const SERVICE_PANELS: readonly ServicePanel[] = [
  {
    id: "projects",
    name: ["المشاريع", "Projects"],
    headline: ["من الفكرة إلى *مشروع أقوى*", "From idea to a *stronger project*"],
    sub: ["حلّل فكرتك · قيّمها · ادرسها · وابدأ التنفيذ بثقة", "Analyze · evaluate · study · and start with confidence"],
    tiles: [
      { label: ["بدء مشروع", "Start a project"], href: "/projects/start" },
      { label: ["تقييم مشروع", "Evaluate a project"], href: "/projects/evaluation" },
      { label: ["دراسة جدوى", "Feasibility study"], href: "/projects/feasibility" },
      { label: ["تحليل مشروع", "Project analysis"], href: "/projects/analysis" },
    ],
    cta: { label: ["ابدأ مشروعك الآن", "Start your project"], href: "/projects/start" },
  },
  {
    id: "academy",
    name: ["الأكاديمية", "Academy"],
    headline: ["تعلّم اليوم.. *واصنع فرص الغد*", "Learn today.. *build tomorrow*"],
    sub: ["دورات، أبحاث، ندوات، ومسارات تعليمية", "Courses, research, webinars, and learning paths"],
    tiles: [
      { label: ["دورات تعليمية", "Online courses"], href: "/academy/courses" },
      { label: ["دراسات وأبحاث", "Studies & research"], href: "/academy/studies" },
      { label: ["ندوات مباشرة", "Live webinars"], href: "/academy/webinars" },
      { label: ["مسارات متخصصة", "Specialized paths"], href: "/academy/paths" },
    ],
    cta: { label: ["اكتشف الأكاديمية", "Discover the Academy"], href: "/academy" },
  },
  {
    id: "talent",
    name: ["التوظيف", "Talent"],
    headline: ["وظّف بذكاء أو *اعثر* على *فرصتك*", "Hire smart or *find* your *chance*"],
    sub: ["حلول توظيف ذكية لأصحاب الأعمال والباحثين عن العمل", "Smart hiring for employers and job seekers"],
    tiles: [
      { label: ["إدارة الوظائف", "Job management"], href: "/talent/employer/jobs" },
      { label: ["البحث عن مرشحين", "Find candidates"], href: "/talent/employer/search" },
      { label: ["السيرة الذاتية", "Resume"], href: "/talent/profile/cv" },
      { label: ["فرص العمل", "Job openings"], href: "/talent/jobs" },
    ],
    cta: { label: ["ادخل إلى التوظيف", "Enter Talent"], href: "/talent" },
  },
  {
    id: "market",
    name: ["السوق", "Market"],
    headline: ["اكتشف الفرص التي *تبحث عنها*", "Discover opportunities *you seek*"],
    sub: ["بيئة ذكية لعرض وطلب الفرص والمشاريع", "A smart space to offer and request opportunities"],
    tiles: [
      { label: ["بيع وشراء", "Buy & sell"], href: "/market/listings" },
      { label: ["متاجر وأنشطة", "Shops & businesses"], href: market({ kind: "BUSINESS" }) },
      { label: ["مطاعم ومقاهي", "Restaurants & cafés"], href: market({ q: "مطاعم" }) },
      { label: ["عقارات وأراضي", "Real estate & land"], href: market({ q: "عقارات" }) },
    ],
    cta: { label: ["استكشف السوق", "Explore the Market"], href: "/market" },
    underline: "gold",
  },
  {
    id: "software",
    name: ["البرمجيات", "Software"],
    headline: ["أدر أعمالك *بذكاء*", "Run your business *smartly*"],
    sub: ["أنظمة متكاملة تساعدك على النمو", "Integrated systems that help you grow"],
    tiles: [
      { label: ["المحاسبة", "Accounting"], href: "/software/accounting" },
      { label: ["متابعة المبيعات", "Sales tracking"], href: "/software/sales" },
      { label: ["الموارد البشرية", "Human resources"], href: "/software/hr" },
      { label: ["مراقبة الأسطول", "Fleet monitoring"], href: "/programs/fleet" },
    ],
    cta: { label: ["استكشف برمجيات جنان", "Explore Jenan Software"], href: "/software" },
  },
  {
    id: "marketing",
    name: ["التسويق", "Marketing"],
    headline: ["خدمات *الإعلان والتسويق*", "*Advertising & marketing* services"],
    sub: ["إعلانات ذكية .. نتائج حقيقية .. نمو أسرع لأعمالك", "Smart ads · real results · faster growth for your business"],
    tiles: [
      { label: ["تقارير تفصيلية", "Detailed reports"], note: ["قياس الأداء\nومتابعة العائد", "Track results\nand returns"], href: "/marketing/analytics" },
      { label: ["إدارة الحملات", "Campaigns"], note: ["إنشاء - متابعة\nتحسين النتائج", "Create · track\nimprove results"], href: "/marketing/campaigns" },
      { label: ["تصميم المحتوى", "Content design"], note: ["صور - فيديوهات\nمنشورات احترافية", "Images, videos\nand posts"], href: "/marketing/channels" },
      { label: ["إعلانات مستهدفة", "Targeted ads"], note: ["نصل إلى جمهورك\nالمناسب بدقة", "Reach the right\naudience"], href: "/marketing/audience" },
    ],
    cta: {
      label: ["اطلب حملتك الإعلانية الآن", "Request your campaign"],
      note: ["امتلك حضوراً أقوى .. وزد مبيعاتك", "A stronger presence, more sales"],
      href: "/marketing/campaign/new",
    },
    variant: "marketing",
  },
  {
    id: "tools",
    name: ["الأدوات", "Tools"],
    headline: ["صمّم وأنجز في *مكان واحد*", "Design & deliver *in one place*"],
    sub: ["أدوات احترافية لتسهيل أعمالك اليومية", "Professional tools that simplify your daily work"],
    tiles: [
      { label: ["ملفات PDF", "PDF files"], href: "/studio/pdf" },
      { label: ["تحويل الصور", "Image conversion"], href: "/studio/pdf/editor?tool=convert" },
      { label: ["تصميم شعارات", "Logo design"], href: "/studio/logo" },
      { label: ["سيرة ذاتية", "Resume"], href: "/studio/cv" },
    ],
    cta: { label: ["استعرض الأدوات", "Browse the tools"], href: "/studio" },
  },
];
