import type { SectionShowcaseProps } from "@/components/shell/section-showcase";

/** What each section's first page says about it. Every link is a working page; every statement is a capability, not a figure. */
type SectionContent = Omit<SectionShowcaseProps, "locale" | "userLabel">;

export const SOFTWARE_SHOWCASE: SectionContent = {
  attributes: { "data-software-route": "/software" },
  route: "/software",
  photo: "/assets/home-panels/software-scene.webp",
  tag: { icon: "cube", label: ["برمجيات جنان", "Jenan Software"] },
  title: [["أدوات عملك", "The tools of your work"], ["في مكان واحد", "in one place"]],
  pitch: [
    "حوّل ملفاتك، صمّم هويتك ومستنداتك، وأدر شركتك من الفواتير إلى المخزون والرواتب. كل أداة تعمل فعلًا.",
    "Convert your files, design your identity and documents, and run your company from invoices to stock and payroll. Every tool really works.",
  ],
  primary: { href: "/software/files", icon: "bolt", label: ["أدوات الملفات", "File tools"] },
  secondary: { href: "/software/design", icon: "sparkles", label: ["استوديو التصميم", "Design studio"] },
  facts: [
    { icon: "grid", title: ["8 أدوات للملفات", "8 file tools"], text: ["دمج وتقسيم وضغط وتحويل PDF وWord وExcel", "Merge, split, compress and convert PDF, Word and Excel"] },
    { icon: "sparkles", title: ["6 أنواع تصميم", "6 design types"], text: ["شعار وورق رسمي وسيرة ذاتية وعروض", "Logo, letterhead, CV and presentations"] },
    { icon: "building", title: ["إدارة أعمال متكاملة", "Integrated business management"], text: ["مبيعات ومحاسبة ومخزون وموارد بشرية", "Sales, accounting, stock and HR"] },
  ],
  servicesLabel: ["خدمات البرمجيات", "Software services"],
  services: [
    { href: "/software/files", icon: "grid", tone: "cyan", title: ["أدوات الملفات", "File tools"], description: ["دمج وتقسيم وضغط PDF، والتحويل بين PDF وWord وExcel.", "Merge, split and compress PDFs, and convert between PDF, Word and Excel."] },
    { href: "/software/design", icon: "sparkles", tone: "violet", title: ["استوديو التصميم", "Design studio"], description: ["شعارات وورق رسمي وسير ذاتية ومستندات وعروض تقديمية قابلة للتنزيل.", "Logos, letterheads, CVs, documents and presentations ready to download."] },
    { href: "/software/business", icon: "building", tone: "emerald", title: ["إدارة الأعمال", "Business management"], description: ["لوحة واحدة لشركتك: المبيعات والمشتريات والمحاسبة والتقارير.", "One board for your company: sales, purchases, accounting and reports."] },
    { href: "/software/sales/invoices", icon: "wallet", tone: "gold", title: ["الفواتير والمبيعات", "Invoices and sales"], description: ["أصدر فواتير منظمة وتابع المبيعات والتحصيل.", "Issue organised invoices and follow sales and collection."] },
    { href: "/software/inventory", icon: "cube", tone: "blue", title: ["المخزون", "Inventory"], description: ["كميات الأصناف وحركتها ونقاط إعادة الطلب.", "Item quantities, movements and reorder points."] },
    { href: "/software/crm", icon: "people", tone: "pink", title: ["العملاء والموارد البشرية", "Customers and HR"], description: ["سجل العملاء والفرص، والموظفون والرواتب في نظام واحد.", "Customers and deals, staff and payroll in a single system."] },
  ],
};

export const ACADEMY_SHOWCASE: SectionContent = {
  route: "/academy",
  photo: "/assets/home-panels/academy-scene.webp",
  tag: { icon: "graduation", label: ["أكاديمية جنان", "Jenan Academy"] },
  title: [["تعلّم ما يبني", "Learn what builds"], ["مسارك المهني", "your career"]],
  pitch: [
    "دورات ومسارات وأبحاث وندوات وحالات دراسية في مكان واحد، مع اختبارات وشهادات يمكن التحقق منها.",
    "Courses, paths, research, webinars and case studies in one place, with assessments and certificates anyone can verify.",
  ],
  primary: { href: "/academy/courses", icon: "graduation", label: ["تصفح الدورات", "Browse courses"] },
  secondary: { href: "/academy/search", icon: "search", label: ["ابحث في الأكاديمية", "Search the academy"] },
  facts: [
    { icon: "rocket", title: ["مسارات تعليمية", "Learning paths"], text: ["خطوات مرتبة من الأساس إلى الاحتراف", "Ordered steps from the basics to mastery"] },
    { icon: "check", title: ["اختبارات وتقييمات", "Assessments"], text: ["قياس مستواك أثناء تعلّمك", "Measure your level as you learn"] },
    { icon: "shield", title: ["شهادات قابلة للتحقق", "Verifiable certificates"], text: ["رابط تحقق عام لكل شهادة", "A public verification link for every certificate"] },
  ],
  servicesLabel: ["خدمات الأكاديمية", "Academy services"],
  services: [
    { href: "/academy/courses", icon: "graduation", tone: "cyan", title: ["الدورات", "Courses"], description: ["دورات منظمة بدروس وتقييمات وتقدّم محفوظ لك.", "Structured courses with lessons, assessments and saved progress."] },
    { href: "/academy/paths", icon: "rocket", tone: "emerald", title: ["المسارات التعليمية", "Learning paths"], description: ["رحلة متكاملة تجمع عدة دورات نحو هدف مهني واضح.", "A full journey that joins several courses toward a clear career goal."] },
    { href: "/academy/research", icon: "brain", tone: "violet", title: ["الأبحاث والتقارير", "Research and reports"], description: ["أبحاث وتقارير موثقة المصدر في مجالات الأعمال.", "Sourced research and reports across business fields."] },
    { href: "/academy/webinars", icon: "people", tone: "gold", title: ["الندوات واللقاءات", "Webinars and sessions"], description: ["ندوات مباشرة ومسجلة مع خبراء في المجال.", "Live and recorded webinars with practitioners."] },
    { href: "/academy/studies", icon: "briefcase", tone: "blue", title: ["الدراسات والحالات", "Studies and cases"], description: ["حالات دراسية تطبيقية تربط النظرية بسوق العمل.", "Applied case studies that tie theory to the market."] },
    { href: "/academy/certificates", icon: "shield", tone: "pink", title: ["الشهادات", "Certificates"], description: ["شهاداتك المكتسبة مع رابط تحقق عام.", "Your earned certificates, each with a public verification link."] },
  ],
};

export const TALENT_SHOWCASE: SectionContent = {
  route: "/talent",
  photo: "/assets/home-panels/talent-scene.webp",
  tag: { icon: "people", label: ["توظيف جنان", "Jenan Talent"] },
  title: [["الوظيفة المناسبة", "The right job"], ["والكفاءة المناسبة", "and the right talent"]],
  pitch: [
    "للباحث عن عمل: وظائف وملف مهني وتتبع للطلبات. لصاحب العمل: نشر الوظائف وفرز المتقدمين وإدارة المقابلات. ويبقى كل شيء بموافقتك.",
    "For job seekers: jobs, a professional profile and application tracking. For employers: post jobs, screen applicants and manage interviews. Everything stays under your consent.",
  ],
  primary: { href: "/talent/jobs", icon: "briefcase", label: ["ابحث عن وظيفة", "Find a job"] },
  secondary: { href: "/talent/employer", icon: "building", label: ["أنا صاحب عمل", "I am an employer"] },
  facts: [
    { icon: "user", title: ["ملف مهني وسيرة ذاتية", "Profile and CV"], text: ["ابنِ ملفك مرة واحدة وقدّم به", "Build it once and apply with it"] },
    { icon: "check", title: ["تتبع كل طلب", "Track every application"], text: ["من التقديم إلى المقابلة والقرار", "From applying to interview and decision"] },
    { icon: "lock", title: ["خصوصية بموافقتك", "Privacy by consent"], text: ["لا تُشارك بياناتك دون إذنك", "Your data is shared only with your permission"] },
  ],
  servicesLabel: ["خدمات التوظيف", "Talent services"],
  services: [
    { href: "/talent/jobs", icon: "briefcase", tone: "cyan", title: ["الوظائف", "Jobs"], description: ["استعرض الوظائف وفلترها واحفظ ما يناسبك وقدّم مباشرة.", "Browse and filter jobs, save the ones you like and apply directly."] },
    { href: "/talent/applications", icon: "check", tone: "emerald", title: ["طلباتي", "My applications"], description: ["تابع حالة كل طلب وموعد المقابلة والرسائل المرتبطة به.", "Follow each application's status, interview date and messages."] },
    { href: "/talent/profile/cv", icon: "user", tone: "violet", title: ["الملف والسيرة الذاتية", "Profile and CV"], description: ["ملف مهني وسيرة ذاتية جاهزة للتقديم.", "A professional profile and a CV ready to apply with."] },
    { href: "/talent/matching", icon: "brain", tone: "gold", title: ["المطابقة الذكية", "Smart matching"], description: ["ترشيحات وظائف مبنية على ملفك المهني.", "Job suggestions based on your professional profile."] },
    { href: "/talent/employer/jobs/new", icon: "plus", tone: "blue", title: ["انشر وظيفة", "Post a job"], description: ["أنشئ إعلانًا واضحًا وابدأ باستقبال المتقدمين.", "Create a clear listing and start receiving applicants."] },
    { href: "/talent/employer/search", icon: "search", tone: "pink", title: ["البحث عن مرشحين", "Find candidates"], description: ["ابحث في المرشحين الذين أتاحوا ملفاتهم ونظّم القوائم المختصرة.", "Search candidates who shared their profiles and keep shortlists."] },
  ],
};

export const MARKETING_SHOWCASE: SectionContent = {
  route: "/marketing",
  photo: "/assets/home-panels/marketing-scene.webp",
  tag: { icon: "megaphone", label: ["تسويق جنان", "Jenan Marketing"] },
  title: [["حملات تسويقية", "Marketing campaigns"], ["تقيسها بأرقام حقيقية", "measured by real numbers"]],
  pitch: [
    "أنشئ حملتك، حدّد جمهورك وقنواتك وميزانيتك، وتابع العملاء المسجلين فعلًا. لا نعرض أي نتيجة لم تُسجَّل.",
    "Create your campaign, define your audience, channels and budget, and follow the leads actually recorded. We never show a result that was not recorded.",
  ],
  primary: { href: "/marketing/campaign/new", icon: "plus", label: ["أنشئ حملة", "Create a campaign"] },
  secondary: { href: "/marketing/dashboard", icon: "dashboard", label: ["لوحة التسويق", "Marketing board"] },
  facts: [
    { icon: "people", title: ["جمهور محدد", "A defined audience"], text: ["الفئة والموقع والاهتمام قبل الإطلاق", "Segment, place and interest before launch"] },
    { icon: "link", title: ["قنوات متعددة", "Several channels"], text: ["اختر القنوات المناسبة لهدفك", "Pick the channels that fit your goal"] },
    { icon: "shield", title: ["أرقام موثقة", "Recorded figures"], text: ["لا مقاييس خارجية قبل ربط المزود", "No external metrics before a provider is connected"] },
  ],
  servicesLabel: ["خدمات التسويق", "Marketing services"],
  services: [
    { href: "/marketing/campaign/new", icon: "plus", tone: "cyan", title: ["إنشاء حملة", "Create a campaign"], description: ["الهدف والجمهور والقناة والميزانية في خطوات واضحة.", "Objective, audience, channel and budget in clear steps."] },
    { href: "/marketing/campaigns", icon: "megaphone", tone: "emerald", title: ["حملاتي", "My campaigns"], description: ["كل حملاتك وحالتها وتفاصيل الدفع والتفعيل.", "All your campaigns with their status, payment and activation details."] },
    { href: "/marketing/audience", icon: "people", tone: "violet", title: ["الجمهور", "Audience"], description: ["عرّف فئاتك المستهدفة وأعد استخدامها في حملاتك.", "Define your target segments and reuse them across campaigns."] },
    { href: "/marketing/channels", icon: "link", tone: "gold", title: ["القنوات", "Channels"], description: ["قارن القنوات المتاحة واختر الأنسب لميزانيتك.", "Compare the available channels and choose what fits your budget."] },
    { href: "/marketing/leads", icon: "user", tone: "blue", title: ["العملاء المحتملون", "Leads"], description: ["سجّل العملاء وتابع تحويلهم مرحلة بعد مرحلة.", "Record leads and follow their conversion stage by stage."] },
    { href: "/marketing/analytics", icon: "barChart", tone: "pink", title: ["التحليلات", "Analytics"], description: ["قمع التحويل والنتائج من العملاء المسجلين فقط.", "The funnel and results from recorded leads only."] },
  ],
};

export const MARKET_SHOWCASE: SectionContent = {
  route: "/market",
  photo: "/assets/home-panels/market-scene.webp",
  tag: { icon: "cart", label: ["سوق جنان", "Jenan Market"] },
  title: [["اشترِ وبع المشاريع", "Buy and sell projects"], ["بثقة وشفافية", "with trust and clarity"]],
  pitch: [
    "سوق للمشاريع والأنشطة التجارية: تصفّح الفرص، أبدِ اهتمامك، وانتقل من اتفاقية السرية إلى المعاينة والعرض والإغلاق في مسار واضح.",
    "A market for projects and businesses: browse opportunities, show interest, and move from the confidentiality agreement to viewing, offer and closing in one clear path.",
  ],
  primary: { href: "/market/listings", icon: "search", label: ["تصفح العروض", "Browse listings"] },
  secondary: { href: "/market/sell", icon: "plus", label: ["أعلن للبيع", "List for sale"] },
  facts: [
    { icon: "lock", title: ["سرية قبل التفاصيل", "Confidential first"], text: ["لا تُكشف التفاصيل المحمية قبل اتفاقية السرية", "Protected details stay hidden until the NDA"] },
    { icon: "check", title: ["مسار صفقة واضح", "A clear deal path"], text: ["من التواصل إلى الإغلاق بمراحل مسجلة", "From contact to closing in recorded stages"] },
    { icon: "shield", title: ["سعر معلن وتقييم", "Stated price, valuation"], text: ["يذكر المعلن سعره وتبريره", "The seller states the price and its rationale"] },
  ],
  servicesLabel: ["خدمات السوق", "Market services"],
  services: [
    { href: "/market/listings", icon: "search", tone: "cyan", title: ["تصفح العروض", "Browse listings"], description: ["ابحث بالنوع والسعر والموقع والحالة.", "Search by kind, price, location and status."] },
    { href: "/market/sell", icon: "plus", tone: "emerald", title: ["أعلن للبيع", "List for sale"], description: ["معالج من أربع خطوات لنشر مشروعك أو نشاطك.", "A four-step wizard to publish your project or business."] },
    { href: "/market/dashboard", icon: "dashboard", tone: "violet", title: ["لوحة السوق", "Market board"], description: ["إعلاناتك وطلبات الاهتمام الواردة وحالتها.", "Your listings, the inquiries received and their status."] },
    { href: "/market/nda/sample", icon: "lock", tone: "gold", title: ["اتفاقية السرية", "Confidentiality agreement"], description: ["وقّع قبل الاطلاع على التفاصيل والمستندات المحمية.", "Sign before seeing the protected details and documents."] },
    { href: "/market/offer/sample", icon: "wallet", tone: "blue", title: ["عروض الشراء", "Purchase offers"], description: ["قدّم عرضك بالقيمة والشروط ومدة الصلاحية.", "Submit your offer with value, terms and validity."] },
    { href: "/market/deal/sample", icon: "trend", tone: "pink", title: ["مسار الصفقة", "Deal stages"], description: ["تابع الصفقة من التواصل إلى الفحص والمعاينة والإغلاق.", "Follow the deal from contact to review, viewing and closing."] },
  ],
};
