import type { SectionShowcaseProps } from "@/components/shell/section-showcase";

/** What each section's first page says about it. Every link is a working page; every statement is a capability, not a figure. */
type SectionContent = Omit<SectionShowcaseProps, "locale" | "userLabel">;

export const SOFTWARE_SHOWCASE: SectionContent = {
  attributes: { "data-software-route": "/software" },
  route: "/software",
  photo: "/assets/home-panels/software-scene.webp",
  tag: { icon: "cube", label: ["برمجيات جنان", "Jenan Software"] },
  title: [["برمجيات وأدوات", "Professional software"], ["احترافية لعملك", "and tools for your work"]],
  pitch: [
    "أنشئ وحوّل وصمّم ملفاتك ومستنداتك من مكان واحد، وأدر شركتك من الفواتير إلى المخزون والرواتب. كل أداة تعمل فعلًا.",
    "Create, convert and design your files and documents in one place, and run your company from invoices to stock and payroll. Every tool really works.",
  ],
  search: { scope: "/software", placeholder: ["ابحث عن أداة: دمج PDF، شعار، سيرة ذاتية...", "Find a tool: merge PDF, logo, CV..."] },
  primary: { href: "/software/files", icon: "bolt", label: ["أدوات الملفات", "File tools"] },
  secondary: { href: "/software/design", icon: "sparkles", label: ["استوديو التصميم", "Design studio"] },
  cta: ["استخدم الآن", "Use now"],
  facts: [
    { icon: "grid", title: ["8 أدوات للملفات", "8 file tools"], text: ["دمج وتقسيم وضغط وتحويل PDF وWord وExcel", "Merge, split, compress and convert PDF, Word and Excel"] },
    { icon: "sparkles", title: ["6 أنواع تصميم", "6 design types"], text: ["شعار وورق رسمي وسيرة ذاتية وعروض", "Logo, letterhead, CV and presentations"] },
    { icon: "building", title: ["إدارة أعمال متكاملة", "Integrated business management"], text: ["مبيعات ومحاسبة ومخزون وموارد بشرية", "Sales, accounting, stock and HR"] },
  ],
  servicesLabel: ["خدمات البرمجيات", "Software services"],
  services: [
    { href: "/software/files", icon: "grid", tone: "pink", title: ["ملفات PDF", "PDF files"], description: ["دمج وفصل وضغط وتحرير ملفات PDF.", "Merge, split and compress PDF files."] },
    { href: "/software/files/word-to-pdf", icon: "link", tone: "blue", title: ["تحويل الملفات", "File conversion"], description: ["تحويل بين PDF وWord وExcel بسهولة.", "Convert between PDF, Word and Excel."] },
    { href: "/software/files/images-to-pdf", icon: "pieChart", tone: "emerald", title: ["الصور إلى PDF", "Images to PDF"], description: ["اجمع صورك في ملف PDF واحد مرتب.", "Combine your images into one tidy PDF."] },
    { href: "/software/design/logo", icon: "sparkles", tone: "violet", title: ["تصميم شعار", "Logo design"], description: ["هوية بصرية قابلة للتنزيل لمشروعك.", "A downloadable brand identity for your project."] },
    { href: "/software/design/letterhead", icon: "mail", tone: "gold", title: ["ورق رسمي", "Letterhead"], description: ["ترويسة وتذييل احترافيان لمراسلاتك.", "A professional header and footer for your letters."] },
    { href: "/software/design/cv", icon: "user", tone: "cyan", title: ["سيرة ذاتية", "CV builder"], description: ["قوالب مهنية وإصدارات محفوظة.", "Professional templates and saved versions."] },
    { href: "/software/design/presentations", icon: "barChart", tone: "blue", title: ["عروض تقديمية", "Presentations"], description: ["شرائح متعددة التخطيطات جاهزة للعرض.", "Multi-layout slides ready to present."] },
    { href: "/software/business", icon: "building", tone: "emerald", title: ["إدارة الأعمال", "Business suite"], description: ["المبيعات والمحاسبة والمخزون والتقارير.", "Sales, accounting, stock and reports."] },
  ],
  panels: [
    { kind: "live", icon: "activity", source: "software-documents", title: ["أحدث أعمالي", "My latest work"], href: "/software/design/history", linkLabel: ["عرض الكل", "View all"], emptyText: ["لم تنشئ أي ملف بعد. ابدأ من استوديو التصميم.", "You have not created any file yet. Start from the design studio."] },
    { kind: "links", icon: "bolt", title: ["إجراءات سريعة", "Quick actions"], items: [
      { href: "/software/files/merge-pdf", icon: "grid", title: ["دمج PDF", "Merge PDF"] },
      { href: "/software/files/compress-pdf", icon: "activity", title: ["ضغط PDF", "Compress PDF"] },
      { href: "/software/design/logo", icon: "sparkles", title: ["تصميم شعار", "Design a logo"] },
      { href: "/software/design/cv", icon: "user", title: ["سيرة ذاتية", "Build a CV"] },
    ] },
    { kind: "steps", icon: "check", title: ["كيف تعمل الأدوات", "How the tools work"], steps: [
      { title: ["اختر الأداة", "Pick a tool"], text: ["من البطاقات أو البحث", "From the cards or search"] },
      { title: ["ارفع أو صمّم", "Upload or design"], text: ["ملفك أو مستندك", "Your file or document"] },
      { title: ["راجع النتيجة", "Review"], text: ["قبل التنزيل", "Before you download"] },
      { title: ["نزّل أو احفظ", "Download or save"], text: ["وعد إليها لاحقًا", "And come back later"] },
    ] },
  ],
};

export const ACADEMY_SHOWCASE: SectionContent = {
  route: "/academy",
  photo: "/assets/home-panels/academy-scene.webp",
  tag: { icon: "graduation", label: ["أكاديمية جنان", "Jenan Academy"] },
  title: [["أكاديمية متكاملة", "A complete academy"], ["تصنع معرفة حقيقية", "that builds real knowledge"]],
  pitch: [
    "دورات ومسارات وأبحاث وندوات وحالات دراسية في مكان واحد، مع اختبارات وشهادات يمكن التحقق منها.",
    "Courses, paths, research, webinars and case studies in one place, with assessments and certificates anyone can verify.",
  ],
  search: { scope: "/academy", placeholder: ["ابحث في صفحات الأكاديمية...", "Search the academy's pages..."] },
  primary: { href: "/academy/courses", icon: "graduation", label: ["تصفح الدورات", "Browse courses"] },
  secondary: { href: "/academy/search", icon: "search", label: ["بحث المحتوى", "Search content"] },
  cta: ["افتح", "Open"],
  facts: [
    { icon: "rocket", title: ["مسارات تعليمية", "Learning paths"], text: ["خطوات مرتبة من الأساس إلى الاحتراف", "Ordered steps from the basics to mastery"] },
    { icon: "check", title: ["اختبارات وتقييمات", "Assessments"], text: ["قياس مستواك أثناء تعلّمك", "Measure your level as you learn"] },
    { icon: "shield", title: ["شهادات قابلة للتحقق", "Verifiable certificates"], text: ["رابط تحقق عام لكل شهادة", "A public verification link for every certificate"] },
  ],
  servicesLabel: ["خدمات الأكاديمية", "Academy services"],
  services: [
    { href: "/academy/courses", icon: "graduation", tone: "gold", title: ["دورات تعليمية", "Courses"], description: ["دورات منظمة بدروس وتقييمات وتقدّم محفوظ.", "Structured courses with lessons, assessments and saved progress."] },
    { href: "/academy/paths", icon: "rocket", tone: "cyan", title: ["مسارات متخصصة", "Learning paths"], description: ["رحلة تجمع عدة دورات نحو هدف مهني.", "A journey of several courses toward a career goal."] },
    { href: "/academy/research", icon: "brain", tone: "violet", title: ["دراسات وأبحاث", "Research"], description: ["أبحاث وتقارير موثقة المصدر.", "Sourced research and reports."] },
    { href: "/academy/webinars", icon: "people", tone: "emerald", title: ["ندوات مباشرة", "Webinars"], description: ["ندوات مباشرة ومسجلة مع خبراء.", "Live and recorded sessions with practitioners."] },
    { href: "/academy/studies", icon: "briefcase", tone: "blue", title: ["دراسات وحالات", "Case studies"], description: ["حالات تطبيقية تربط النظرية بالسوق.", "Applied cases that tie theory to the market."] },
    { href: "/academy/library", icon: "grid", tone: "pink", title: ["مكتبة معرفية", "Library"], description: ["مقالات وأدلة وموارد قابلة للتنزيل.", "Articles, guides and downloadable resources."] },
    { href: "/academy/community", icon: "link", tone: "cyan", title: ["مجتمع التعلم", "Community"], description: ["تعلّم مع الآخرين وتبادل الخبرة.", "Learn with others and share experience."] },
    { href: "/academy/certificates", icon: "shield", tone: "gold", title: ["شهادات", "Certificates"], description: ["شهاداتك مع رابط تحقق عام.", "Your certificates, each with a public verification link."] },
  ],
  panels: [
    { kind: "live", icon: "graduation", source: "academy-courses", title: ["أحدث الدورات", "Latest courses"], href: "/academy/courses", linkLabel: ["عرض الكل", "View all"], emptyText: ["لا توجد دورات منشورة بعد.", "No courses are published yet."] },
    { kind: "live", icon: "barChart", source: "academy-overview", title: ["أكاديميتي", "My academy"], href: "/academy/journey", linkLabel: ["رحلتي", "My journey"], emptyText: ["لا توجد بيانات بعد.", "No data yet."] },
    { kind: "steps", icon: "check", title: ["رحلة التعلّم", "The learning path"], steps: [
      { title: ["اختر دورة", "Pick a course"], text: ["أو مسارًا كاملًا", "Or a whole path"] },
      { title: ["تعلّم وطبّق", "Learn and practise"], text: ["دروس وتمارين", "Lessons and exercises"] },
      { title: ["اختبر نفسك", "Test yourself"], text: ["تقييمات واختبارات", "Assessments and exams"] },
      { title: ["احصل على شهادة", "Earn a certificate"], text: ["قابلة للتحقق", "Verifiable"] },
    ] },
  ],
};

export const TALENT_SHOWCASE: SectionContent = {
  route: "/talent",
  photo: "/assets/home-panels/talent-scene.webp",
  tag: { icon: "people", label: ["وظائف جنان", "Jenan Talent"] },
  title: [["فرص حقيقية", "Real opportunities"], ["لمستقبل أفضل", "for a better future"]],
  pitch: [
    "للباحث عن عمل: وظائف وملف مهني وتتبع للطلبات. لصاحب العمل: نشر الوظائف وفرز المتقدمين وإدارة المقابلات. ويبقى كل شيء بموافقتك.",
    "For job seekers: jobs, a professional profile and application tracking. For employers: post jobs, screen applicants and manage interviews. Everything stays under your consent.",
  ],
  search: { scope: "/talent", placeholder: ["ابحث في صفحات التوظيف...", "Search the talent pages..."] },
  primary: { href: "/talent/jobs", icon: "briefcase", label: ["ابحث عن وظيفة", "Find a job"] },
  secondary: { href: "/talent/employer", icon: "building", label: ["أنا صاحب عمل", "I am an employer"] },
  cta: ["افتح", "Open"],
  facts: [
    { icon: "user", title: ["ملف مهني وسيرة ذاتية", "Profile and CV"], text: ["ابنِ ملفك مرة واحدة وقدّم به", "Build it once and apply with it"] },
    { icon: "check", title: ["تتبع كل طلب", "Track every application"], text: ["من التقديم إلى المقابلة والقرار", "From applying to interview and decision"] },
    { icon: "lock", title: ["خصوصية بموافقتك", "Privacy by consent"], text: ["لا تُشارك بياناتك دون إذنك", "Your data is shared only with your permission"] },
  ],
  servicesLabel: ["خدمات التوظيف", "Talent services"],
  services: [
    { href: "/talent/jobs", icon: "briefcase", tone: "cyan", title: ["الوظائف", "Jobs"], description: ["استعرض الوظائف وفلترها واحفظ ما يناسبك وقدّم مباشرة.", "Browse and filter jobs, save the ones you like and apply directly."] },
    { href: "/talent/applications", icon: "check", tone: "emerald", title: ["طلباتي", "My applications"], description: ["حالة كل طلب وموعد المقابلة والرسائل.", "Each application's status, interview date and messages."] },
    { href: "/talent/profile/cv", icon: "user", tone: "violet", title: ["الملف والسيرة", "Profile and CV"], description: ["ملف مهني وسيرة ذاتية جاهزة للتقديم.", "A professional profile and a CV ready to apply with."] },
    { href: "/talent/matching", icon: "brain", tone: "gold", title: ["المطابقة الذكية", "Smart matching"], description: ["ترشيحات وظائف مبنية على ملفك المهني.", "Job suggestions based on your professional profile."] },
    { href: "/talent/employer/jobs/new", icon: "plus", tone: "blue", title: ["انشر وظيفة", "Post a job"], description: ["أنشئ إعلانًا واضحًا وابدأ باستقبال المتقدمين.", "Create a clear listing and start receiving applicants."] },
    { href: "/talent/employer/search", icon: "search", tone: "pink", title: ["البحث عن مرشحين", "Find candidates"], description: ["مرشحون أتاحوا ملفاتهم، وقوائم مختصرة.", "Candidates who shared their profiles, and shortlists."] },
  ],
  panels: [
    { kind: "live", icon: "briefcase", source: "talent-jobs", title: ["أحدث الوظائف", "Latest jobs"], href: "/talent/jobs", linkLabel: ["عرض الكل", "View all"], emptyText: ["لا توجد وظائف منشورة الآن.", "No jobs are published right now."] },
    { kind: "links", icon: "bolt", title: ["إجراءات سريعة", "Quick actions"], items: [
      { href: "/talent/profile/cv", icon: "user", title: ["أنشئ سيرتك الذاتية", "Create your CV"] },
      { href: "/talent/applications", icon: "check", title: ["تتبّع طلباتي", "Track my applications"] },
      { href: "/talent/employer/jobs/new", icon: "plus", title: ["انشر وظيفة", "Post a job"] },
      { href: "/talent/employer/applicants", icon: "people", title: ["إدارة المتقدمين", "Manage applicants"] },
    ] },
    { kind: "steps", icon: "brain", title: ["كيف تعمل المطابقة", "How matching works"], steps: [
      { title: ["عرّف ملفك", "Build your profile"], text: ["مهارات وخبرة", "Skills and experience"] },
      { title: ["نرشّح لك", "We suggest"], text: ["وظائف مناسبة", "Fitting jobs"] },
      { title: ["قدّم", "Apply"], text: ["بضغطة واحدة", "In one click"] },
      { title: ["تابع", "Follow up"], text: ["حتى القرار", "Until the decision"] },
    ] },
  ],
};

export const MARKETING_SHOWCASE: SectionContent = {
  route: "/marketing",
  photo: "/assets/home-panels/marketing-scene.webp",
  tag: { icon: "megaphone", label: ["تسويق جنان", "Jenan Marketing"] },
  title: [["التسويق والإعلان الذكي", "Smart marketing"], ["حملات تقيسها بأرقام حقيقية", "campaigns measured by real numbers"]],
  pitch: [
    "أنشئ حملتك، حدّد جمهورك وقنواتك وميزانيتك، وتابع العملاء المسجلين فعلًا. لا نعرض أي نتيجة لم تُسجَّل.",
    "Create your campaign, define your audience, channels and budget, and follow the leads actually recorded. We never show a result that was not recorded.",
  ],
  search: { scope: "/marketing", placeholder: ["ابحث في صفحات التسويق...", "Search the marketing pages..."] },
  primary: { href: "/marketing/campaign/new", icon: "plus", label: ["أنشئ حملة", "Create a campaign"] },
  secondary: { href: "/marketing/dashboard", icon: "dashboard", label: ["لوحة التسويق", "Marketing board"] },
  cta: ["افتح", "Open"],
  facts: [
    { icon: "people", title: ["جمهور محدد", "A defined audience"], text: ["الفئة والموقع والاهتمام قبل الإطلاق", "Segment, place and interest before launch"] },
    { icon: "link", title: ["قنوات متعددة", "Several channels"], text: ["اختر القنوات المناسبة لهدفك", "Pick the channels that fit your goal"] },
    { icon: "shield", title: ["أرقام موثقة", "Recorded figures"], text: ["لا مقاييس خارجية قبل ربط المزود", "No external metrics before a provider is connected"] },
  ],
  servicesLabel: ["خدمات التسويق", "Marketing services"],
  services: [
    { href: "/marketing/campaign/new", icon: "plus", tone: "gold", title: ["إنشاء حملة", "Create a campaign"], description: ["الهدف والجمهور والقناة والميزانية في خطوات.", "Objective, audience, channel and budget in steps."] },
    { href: "/marketing/campaigns", icon: "megaphone", tone: "emerald", title: ["حملاتي", "My campaigns"], description: ["كل حملاتك وحالتها وتفاصيل الدفع والتفعيل.", "All your campaigns with status, payment and activation."] },
    { href: "/marketing/audience", icon: "people", tone: "violet", title: ["الجمهور", "Audience"], description: ["عرّف فئاتك المستهدفة وأعد استخدامها.", "Define your target segments and reuse them."] },
    { href: "/marketing/channels", icon: "link", tone: "cyan", title: ["القنوات", "Channels"], description: ["قارن القنوات واختر الأنسب لميزانيتك.", "Compare channels and pick what fits your budget."] },
    { href: "/marketing/leads", icon: "user", tone: "blue", title: ["العملاء المحتملون", "Leads"], description: ["سجّل العملاء وتابع تحويلهم مرحلة بمرحلة.", "Record leads and follow their conversion stage by stage."] },
    { href: "/marketing/analytics", icon: "barChart", tone: "pink", title: ["التحليلات", "Analytics"], description: ["قمع التحويل والنتائج من العملاء المسجلين.", "The funnel and results from recorded leads."] },
  ],
  panels: [
    { kind: "live", icon: "megaphone", source: "marketing-campaigns", title: ["أحدث حملاتي", "My latest campaigns"], href: "/marketing/campaigns", linkLabel: ["عرض الكل", "View all"], emptyText: ["لم تنشئ أي حملة بعد.", "You have not created a campaign yet."] },
    { kind: "steps", icon: "check", title: ["مراحل الحملة", "Campaign stages"], steps: [
      { title: ["الهدف والجمهور", "Goal and audience"], text: ["من تخاطب؟", "Who are you reaching?"] },
      { title: ["القناة والميزانية", "Channel and budget"], text: ["أين وبكم؟", "Where, and how much?"] },
      { title: ["الدفع والتفعيل", "Payment and activation"], text: ["بتأكيد الاستلام", "On confirmed receipt"] },
      { title: ["المتابعة", "Follow-up"], text: ["عملاء مسجلون فقط", "Recorded leads only"] },
    ] },
    { kind: "links", icon: "link", title: ["القنوات المتاحة", "Available channels"], items: [
      { href: "/marketing/channels", icon: "sparkles", title: ["المحتوى", "Content"] },
      { href: "/marketing/channels", icon: "mail", title: ["البريد الإلكتروني", "Email"] },
      { href: "/marketing/channels", icon: "people", title: ["منصات التواصل", "Social"] },
      { href: "/marketing/channels", icon: "search", title: ["البحث المدفوع", "Paid search"] },
    ] },
  ],
};

export const MARKET_SHOWCASE: SectionContent = {
  route: "/market",
  photo: "/assets/home-panels/market-scene.webp",
  tag: { icon: "cart", label: ["سوق جنان", "Jenan Market"] },
  title: [["سوق جنان", "Jenan Market"], ["بيع وشراء فرص ذكية في مكان واحد", "buy and sell opportunities in one place"]],
  pitch: [
    "سوق للمشاريع والأنشطة التجارية: تصفّح الفرص، أبدِ اهتمامك، وانتقل من اتفاقية السرية إلى المعاينة والعرض والإغلاق في مسار واضح.",
    "A market for projects and businesses: browse opportunities, show interest, and move from the confidentiality agreement to viewing, offer and closing in one clear path.",
  ],
  search: { scope: "/market", placeholder: ["ابحث في صفحات السوق...", "Search the market pages..."] },
  primary: { href: "/market/listings", icon: "search", label: ["استكشف السوق", "Explore the market"] },
  secondary: { href: "/market/sell", icon: "plus", label: ["أعلن للبيع", "List for sale"] },
  cta: ["افتح", "Open"],
  facts: [
    { icon: "lock", title: ["سرية قبل التفاصيل", "Confidential first"], text: ["لا تُكشف التفاصيل المحمية قبل اتفاقية السرية", "Protected details stay hidden until the NDA"] },
    { icon: "check", title: ["مسار صفقة واضح", "A clear deal path"], text: ["من التواصل إلى الإغلاق بمراحل مسجلة", "From contact to closing in recorded stages"] },
    { icon: "shield", title: ["سعر معلن وتقييم", "Stated price, valuation"], text: ["يذكر المعلن سعره وتبريره", "The seller states the price and its rationale"] },
  ],
  servicesLabel: ["خدمات السوق", "Market services"],
  services: [
    { href: "/market/listings", icon: "search", tone: "cyan", title: ["تصفح العروض", "Browse listings"], description: ["ابحث بالنوع والسعر والموقع والحالة.", "Search by kind, price, location and status."] },
    { href: "/market/sell", icon: "plus", tone: "emerald", title: ["أعلن للبيع", "List for sale"], description: ["معالج من أربع خطوات لنشر مشروعك أو نشاطك.", "A four-step wizard to publish your project or business."] },
    { href: "/market/dashboard", icon: "dashboard", tone: "violet", title: ["لوحة السوق", "Market board"], description: ["إعلاناتك وطلبات الاهتمام الواردة وحالتها.", "Your listings and the inquiries received."] },
    { href: "/market/nda/sample", icon: "lock", tone: "gold", title: ["اتفاقية السرية", "Confidentiality"], description: ["وقّع قبل الاطلاع على التفاصيل المحمية.", "Sign before seeing the protected details."] },
    { href: "/market/offer/sample", icon: "wallet", tone: "blue", title: ["عروض الشراء", "Purchase offers"], description: ["قدّم عرضك بالقيمة والشروط ومدة الصلاحية.", "Submit your offer with value, terms and validity."] },
    { href: "/market/deal/sample", icon: "trend", tone: "pink", title: ["مسار الصفقة", "Deal stages"], description: ["من التواصل إلى الفحص والمعاينة والإغلاق.", "From contact to review, viewing and closing."] },
  ],
  panels: [
    { kind: "live", icon: "cart", source: "market-listings", title: ["أحدث الفرص", "Latest opportunities"], href: "/market/listings", linkLabel: ["عرض الكل", "View all"], emptyText: ["لا توجد فرص منشورة الآن.", "No opportunities are published right now."] },
    { kind: "steps", icon: "shield", title: ["عملية آمنة وموثوقة", "A safe, trusted process"], steps: [
      { title: ["السرية", "Confidentiality"], text: ["اتفاقية قبل التفاصيل", "NDA before details"] },
      { title: ["المعاينة", "Viewing"], text: ["حجز موعد", "Book a time"] },
      { title: ["العرض", "Offer"], text: ["قيمة وشروط", "Value and terms"] },
      { title: ["التوثيق", "Record"], text: ["تقرير الصفقة", "Deal report"] },
    ] },
    { kind: "tips", icon: "lightbulb", title: ["نصائح قبل الشراء", "Tips before buying"], tips: [
      { icon: "search", title: ["تحقق من الجدوى", "Check the viability"], text: ["ادرس السوق والمنافسة", "Study the market and competition"] },
      { icon: "eye", title: ["اطلب معاينة", "Ask for a viewing"], text: ["قبل أي التزام", "Before any commitment"] },
      { icon: "shield", title: ["راجع الوثائق", "Review the papers"], text: ["والتراخيص والعقود", "Licences and contracts"] },
    ] },
  ],
};
