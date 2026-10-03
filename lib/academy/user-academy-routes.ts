export type AcademyFlowDefinition = {
  description: readonly [string, string];
  kind: string;
  route: string;
  sections: readonly (readonly [string, string])[];
  source: "course" | "unavailable";
  title: readonly [string, string];
};

const unavailable = ["لا يوجد مصدر محتوى معتمد لهذا المسار حتى الآن.", "No approved content source is connected to this flow yet."] as const;
const courseDescription = ["محتوى الدورة والتقدم والتقييمات من السجل الأكاديمي الفعلي.", "Course content, progress, and assessments come from the live academy registry."] as const;

export const academyFlowDefinitions: readonly AcademyFlowDefinition[] = [
  { route: "/academy/courses", title: ["الدورات", "Courses"], kind: "list", source: "course", description: courseDescription, sections: [["البحث", "Search"], ["التصنيف", "Categories"], ["بطاقات الدورات", "Course cards"], ["التقدم", "Progress"]] },
  { route: "/academy/course/sample", title: ["تفاصيل الدورة", "Course details"], kind: "detail", source: "course", description: courseDescription, sections: [["الوصف", "Description"], ["الدروس", "Lessons"], ["المختبرات", "Labs"], ["التقييمات", "Assessments"]] },
  { route: "/academy/course/sample/lesson/1", title: ["مشغل الدرس", "Lesson player"], kind: "player", source: "course", description: courseDescription, sections: [["المحتوى", "Content"], ["قائمة الدروس", "Lesson list"], ["التقدم", "Progress"], ["اختبار قصير", "Quiz"]] },
  { route: "/academy/course/sample/quiz", title: ["اختبار الدورة", "Course assessment"], kind: "form", source: "course", description: courseDescription, sections: [["التقييمات", "Assessments"], ["الدرجات", "Scores"], ["التقدم", "Progress"]] },
  { route: "/academy/course/sample/result", title: ["نتيجة الدورة", "Course result"], kind: "dashboard", source: "course", description: courseDescription, sections: [["نسبة الإكمال", "Completion"], ["نتيجة التقييم", "Assessment result"], ["الشهادة", "Certificate"]] },
  { route: "/academy/webinars", title: ["الندوات", "Webinars"], kind: "list", source: "unavailable", description: unavailable, sections: [["القادمة", "Upcoming"], ["المباشرة", "Live"], ["المسجلة", "Recorded"], ["التصنيفات", "Categories"]] },
  { route: "/academy/webinar/sample", title: ["تفاصيل الندوة", "Webinar details"], kind: "detail", source: "unavailable", description: unavailable, sections: [["المتحدث", "Speaker"], ["الموعد", "Schedule"], ["المحاور", "Topics"], ["التسجيل", "Registration"]] },
  { route: "/academy/webinar/sample/live", title: ["الندوة المباشرة", "Live webinar"], kind: "live", source: "unavailable", description: unavailable, sections: [["البث", "Stream"], ["الأسئلة", "Questions"], ["المرفقات", "Attachments"], ["الملاحظات", "Notes"]] },
  { route: "/academy/studies", title: ["الدراسات", "Studies"], kind: "list", source: "unavailable", description: unavailable, sections: [["البحث", "Search"], ["التصنيف", "Categories"], ["الدراسات المحفوظة", "Saved studies"]] },
  { route: "/academy/study/sample", title: ["تفاصيل دراسة", "Study reader"], kind: "reader", source: "unavailable", description: unavailable, sections: [["الملخص", "Summary"], ["المحتوى", "Content"], ["الجداول", "Tables"], ["المراجع والمصادر", "References and sources"]] },
  { route: "/academy/research", title: ["الأبحاث", "Research"], kind: "list", source: "unavailable", description: unavailable, sections: [["البحث", "Search"], ["التصنيف", "Categories"], ["الباحث", "Researcher"], ["التاريخ", "Date"]] },
  { route: "/academy/research/sample", title: ["تفاصيل بحث", "Research reader"], kind: "reader", source: "unavailable", description: unavailable, sections: [["الملخص", "Summary"], ["المنهج", "Method"], ["النتائج", "Results"], ["المراجع", "References"]] },
  { route: "/academy/paths", title: ["المسارات التعليمية", "Learning paths"], kind: "list", source: "unavailable", description: unavailable, sections: [["المسارات", "Paths"], ["المراحل", "Stages"], ["التقدم", "Progress"]] },
  { route: "/academy/path/sample", title: ["تفاصيل المسار", "Learning path details"], kind: "timeline", source: "unavailable", description: unavailable, sections: [["المراحل", "Stages"], ["المتطلبات", "Requirements"], ["التقدم", "Progress"], ["الشهادة", "Certificate"]] },
  { route: "/academy/certificates/sample", title: ["شهادة إتمام", "Completion certificate"], kind: "report", source: "course", description: courseDescription, sections: [["المتعلم", "Learner"], ["الدورة", "Course"], ["التاريخ", "Date"], ["التحقق", "Verification"]] },
];

export function findAcademyFlow(route: string) {
  return academyFlowDefinitions.find((item) => item.route === route);
}