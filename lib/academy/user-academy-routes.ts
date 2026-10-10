export type AcademyFlowDefinition = {
  description: readonly [string, string];
  kind:
    | "assessments"
    | "category"
    | "certificate-list"
    | "community"
    | "dashboard"
    | "detail"
    | "downloads"
    | "form"
    | "journey"
    | "list"
    | "live"
    | "player"
    | "profile"
    | "reader"
    | "report"
    | "search"
    | "sections"
    | "timeline";
  route: string;
  sections: readonly (readonly [string, string])[];
  source: "course" | "mixed" | "resource";
  title: readonly [string, string];
};

const approvedLibrary = ["يعرض هذا المسار السجلات المعتمدة فقط، مع حالة صريحة عند عدم توفر محتوى.", "This flow shows approved records only, with an explicit state when content is unavailable."] as const;
const courseDescription = ["محتوى الدورة والتقدم والتقييمات من السجل الأكاديمي الفعلي.", "Course content, progress, and assessments come from the live academy registry."] as const;
const learnerDescription = ["يعرض هذا المسار تقدم المتعلم وشهاداته ونشاطه المحفوظ من السجلات الفعلية.", "This flow shows the learner's persisted progress, certificates, and saved activity."] as const;

export const academyFlowDefinitions: readonly AcademyFlowDefinition[] = [
  { route: "/academy/courses", title: ["الدورات", "Courses"], kind: "list", source: "course", description: courseDescription, sections: [["البحث", "Search"], ["التصنيف", "Categories"], ["بطاقات الدورات", "Course cards"], ["التقدم", "Progress"]] },
  { route: "/academy/sections", title: ["أقسام الأكاديمية", "Academy sections"], kind: "sections", source: "course", description: courseDescription, sections: [["المال والأعمال", "Finance and business"], ["الاستثمار", "Investment"], ["التجارة الإلكترونية", "E-commerce"], ["المشاريع", "Projects"]] },
  { route: "/academy/section/business", title: ["المال والأعمال", "Finance and business"], kind: "category", source: "course", description: courseDescription, sections: [["الدورات", "Courses"], ["المستوى", "Level"], ["المدة", "Duration"], ["البدء", "Start"]] },
  { route: "/academy/course/sample", title: ["تفاصيل الدورة", "Course details"], kind: "detail", source: "course", description: courseDescription, sections: [["الوصف", "Description"], ["الدروس", "Lessons"], ["المختبرات", "Labs"], ["التقييمات", "Assessments"]] },
  { route: "/academy/course/sample/lesson/1", title: ["مشغل الدرس", "Lesson player"], kind: "player", source: "course", description: courseDescription, sections: [["المحتوى", "Content"], ["قائمة الدروس", "Lesson list"], ["التقدم", "Progress"], ["اختبار قصير", "Quiz"]] },
  { route: "/academy/course/sample/quiz", title: ["اختبار الدورة", "Course assessment"], kind: "form", source: "course", description: courseDescription, sections: [["التقييمات", "Assessments"], ["الدرجات", "Scores"], ["التقدم", "Progress"]] },
  { route: "/academy/course/sample/result", title: ["نتيجة الدورة", "Course result"], kind: "dashboard", source: "course", description: courseDescription, sections: [["نسبة الإكمال", "Completion"], ["نتيجة التقييم", "Assessment result"], ["الشهادة", "Certificate"]] },
  { route: "/academy/webinars", title: ["الندوات واللقاءات المباشرة", "Webinars and live sessions"], kind: "list", source: "resource", description: approvedLibrary, sections: [["القادمة", "Upcoming"], ["المباشرة", "Live"], ["المسجلة", "Recorded"], ["التصنيفات", "Categories"]] },
  { route: "/academy/webinar/sample", title: ["تفاصيل الندوة", "Webinar details"], kind: "detail", source: "resource", description: approvedLibrary, sections: [["المتحدث", "Speaker"], ["الموعد", "Schedule"], ["المحاور", "Topics"], ["التسجيل", "Registration"]] },
  { route: "/academy/webinar/sample/live", title: ["الندوة المباشرة", "Live webinar"], kind: "live", source: "resource", description: approvedLibrary, sections: [["البث", "Stream"], ["الأسئلة", "Questions"], ["المرفقات", "Attachments"], ["الملاحظات", "Notes"]] },
  { route: "/academy/studies", title: ["الدراسات", "Studies"], kind: "list", source: "resource", description: approvedLibrary, sections: [["البحث", "Search"], ["التصنيف", "Categories"], ["الدراسات المحفوظة", "Saved studies"]] },
  { route: "/academy/study/sample", title: ["تفاصيل دراسة", "Study reader"], kind: "reader", source: "resource", description: approvedLibrary, sections: [["الملخص", "Summary"], ["المحتوى", "Content"], ["الجداول", "Tables"], ["المراجع والمصادر", "References and sources"]] },
  { route: "/academy/research", title: ["الأبحاث والدراسات", "Research and studies"], kind: "list", source: "resource", description: approvedLibrary, sections: [["البحث", "Search"], ["التصنيف", "Categories"], ["الباحث", "Researcher"], ["التاريخ", "Date"]] },
  { route: "/academy/research/sample", title: ["تفاصيل بحث", "Research reader"], kind: "reader", source: "resource", description: approvedLibrary, sections: [["الملخص", "Summary"], ["المنهج", "Method"], ["النتائج", "Results"], ["المراجع", "References"]] },
  { route: "/academy/paths", title: ["المسارات التعليمية", "Learning paths"], kind: "list", source: "resource", description: approvedLibrary, sections: [["المسارات", "Paths"], ["المراحل", "Stages"], ["التقدم", "Progress"]] },
  { route: "/academy/path/sample", title: ["تفاصيل المسار", "Learning path details"], kind: "timeline", source: "resource", description: approvedLibrary, sections: [["المراحل", "Stages"], ["المتطلبات", "Requirements"], ["التقدم", "Progress"], ["الشهادة", "Certificate"]] },
  { route: "/academy/journey", title: ["رحلتي التعليمية", "My learning journey"], kind: "journey", source: "mixed", description: learnerDescription, sections: [["الدورات الحالية", "Current courses"], ["التقدم", "Progress"], ["الأنشطة", "Activity"], ["المكتمل", "Completed"]] },
  { route: "/academy/assessments", title: ["الاختبارات والتقييمات", "Assessments"], kind: "assessments", source: "course", description: learnerDescription, sections: [["المتاح", "Available"], ["القادم", "Upcoming"], ["النتائج", "Results"], ["المحاولات", "Attempts"]] },
  { route: "/academy/certificates", title: ["شهاداتي", "My certificates"], kind: "certificate-list", source: "course", description: learnerDescription, sections: [["الشهادات", "Certificates"], ["التحقق", "Verification"], ["الطباعة", "Print"], ["المشاركة", "Share"]] },
  { route: "/academy/certificates/sample", title: ["شهادة إتمام", "Completion certificate"], kind: "report", source: "course", description: courseDescription, sections: [["المتعلم", "Learner"], ["الدورة", "Course"], ["التاريخ", "Date"], ["التحقق", "Verification"]] },
  { route: "/academy/downloads", title: ["المكتبة والتنزيلات", "Library and downloads"], kind: "downloads", source: "mixed", description: learnerDescription, sections: [["المحفوظ", "Saved"], ["المرفقات", "Attachments"], ["المصادر", "Sources"], ["التنزيل", "Download"]] },
  { route: "/academy/community", title: ["مجتمع الأكاديمية", "Academy community"], kind: "community", source: "mixed", description: approvedLibrary, sections: [["النقاشات", "Discussions"], ["الأسئلة", "Questions"], ["الخبراء", "Experts"], ["السياسات", "Policies"]] },
  { route: "/academy/search", title: ["البحث في الأكاديمية", "Academy search"], kind: "search", source: "mixed", description: approvedLibrary, sections: [["الدورات", "Courses"], ["الأبحاث", "Research"], ["الدراسات", "Studies"], ["المسارات", "Paths"]] },
  { route: "/academy/profile", title: ["ملفي الأكاديمي", "Academic profile"], kind: "profile", source: "mixed", description: learnerDescription, sections: [["الملخص", "Overview"], ["الإنجازات", "Achievements"], ["سجل التعلم", "Learning history"], ["الإعدادات", "Settings"]] },
];

export function findAcademyFlow(route: string) {
  return academyFlowDefinitions.find((item) => item.route === route);
}