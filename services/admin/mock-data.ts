export type AdminLanguage = "ar" | "en";

export type OverviewStat = {
  label: string;
  value: string;
  detail: string;
};

export type QuickAction = {
  title: string;
  href: string;
  hint: string;
};

export type WatchlistItem = {
  name: string;
  score: number;
  status: string;
};

export type OperationStage = {
  stage: string;
  count: string;
  detail: string;
};

export type MissionItem = {
  title: string;
  owner: string;
  zone: string;
};

export type BountyLeader = {
  name: string;
  score: number;
  reward: string;
};

export const adminOverviewData = {
  ar: {
    kicker: "نظرة عامة تنفيذية",
    heading: "مركز الاستراتيجية الإدارية",
    description:
      "راقب طبقة الذكاء بالكامل من مكان واحد: جودة الصائدين، تقييم اللجنة، قرارات المهام، وصحة التشغيل دون إظهار المرشحين الضعفاء في واجهة المالك.",
    liveLabel: "ذكاء مباشر",
    total: "5000",
    totalLabel: "صائد في المنظومة",
    quickTitle: "إجراءات سريعة",
    quickSubtitle: "أوامر المالك",
    watchTitle: "قائمة المراقبة",
    watchSubtitle: "أفضل الأداء",
    stats: [
      { label: "الصائدون المرئيون", value: "10", detail: "الأعلى تصنيفاً" },
      { label: "متوسط الذكاء", value: "92%", detail: "نتيجة المنظومة" },
      { label: "التوليد اليومي", value: "+1000", detail: "صائد جديد / 24 ساعة" },
      { label: "معدل الموافقة", value: "78%", detail: "كفاءة القرار" },
    ] satisfies OverviewStat[],
    quickActions: [
      { title: "مخطط العمليات", href: "/admin/operations", hint: "تدفق المهام المباشر" },
      { title: "تصنيف الصائدين", href: "/admin/robots", hint: "فتح الترتيب الكامل" },
      { title: "مراجعة اللجنة", href: "/admin/committee", hint: "تقييم من 50 شخصاً" },
      { title: "لوحة القرارات", href: "/admin/decisions", hint: "موافقة أو تأجيل" },
      { title: "التقارير اليومية", href: "/admin/reports", hint: "نبض الذكاء خلال 24h" },
    ] satisfies QuickAction[],
    watchlist: [
      { name: "Core Dev Prime", score: 98, status: "جاهز" },
      { name: "Signal Forge", score: 97, status: "جاهز" },
      { name: "Pulse Monitor", score: 96, status: "جاهز" },
      { name: "Trust Pilot", score: 95, status: "مراجعة" },
    ] satisfies WatchlistItem[],
  },
  en: {
    kicker: "EXECUTIVE OVERVIEW",
    heading: "Admin strategic center",
    description:
      "Monitor the entire intelligence layer from one place: robot quality, committee validation, task decisions, and operational health without exposing weak candidates to the owner surface.",
    liveLabel: "live intelligence",
    total: "5,000",
    totalLabel: "robots in the system",
    quickTitle: "Quick actions",
    quickSubtitle: "Owner commands",
    watchTitle: "Priority watchlist",
    watchSubtitle: "Top performers",
    stats: [
      { label: "Visible robots", value: "10", detail: "Top-ranked active" },
      { label: "Average intelligence", value: "92%", detail: "system-wide score" },
      { label: "Daily generation", value: "+1000", detail: "new robots / 24h" },
      { label: "Approval rate", value: "78%", detail: "decision efficiency" },
    ] satisfies OverviewStat[],
    quickActions: [
      { title: "Operations pipeline", href: "/admin/operations", hint: "Live mission flow" },
      { title: "Top robot ranking", href: "/admin/robots", hint: "Open full ranking" },
      { title: "Committee review", href: "/admin/committee", hint: "50-person assessment" },
      { title: "Decision board", href: "/admin/decisions", hint: "Approve or defer" },
      { title: "Daily reports", href: "/admin/reports", hint: "24h intelligence pulse" },
    ] satisfies QuickAction[],
    watchlist: [
      { name: "Core Dev Prime", score: 98, status: "Ready" },
      { name: "Signal Forge", score: 97, status: "Ready" },
      { name: "Pulse Monitor", score: 96, status: "Ready" },
      { name: "Trust Pilot", score: 95, status: "Review" },
    ] satisfies WatchlistItem[],
  },
} as const;

export const operationsData = {
  ar: {
    stages: [
      { stage: "تم التوليد", count: "1000", detail: "روبوت جديد اليوم" },
      { stage: "تم التقييم", count: "920", detail: "تمت فحص الجودة" },
      { stage: "اللجنة", count: "50", detail: "مقيمون نشطون" },
      { stage: "تمت الموافقة", count: "214", detail: "انتقل إلى التشغيل" },
      { stage: "مؤجل", count: "84", detail: "قائمة مراجعة" },
    ] satisfies OperationStage[],
    activeMissions: [
      { title: "تحديثات قلب المنصة", owner: "Core Dev Prime", zone: "الإنتاج" },
      { title: "تحسين دورة النمو", owner: "Signal Forge", zone: "النمو" },
      { title: "مراجعة الثقة والتحويل", owner: "Trust Pilot", zone: "العملاء" },
      { title: "توسيع الوصول للسوق", owner: "Launch Vector", zone: "التوسع" },
    ] satisfies MissionItem[],
  },
  en: {
    stages: [
      { stage: "Generated", count: "1000", detail: "new robots today" },
      { stage: "Scored", count: "920", detail: "quality-checked" },
      { stage: "Committee", count: "50", detail: "evaluators active" },
      { stage: "Approved", count: "214", detail: "moved to live" },
      { stage: "Deferred", count: "84", detail: "review queue" },
    ] satisfies OperationStage[],
    activeMissions: [
      { title: "Platform core upgrades", owner: "Core Dev Prime", zone: "Production" },
      { title: "Growth loop optimization", owner: "Signal Forge", zone: "Growth" },
      { title: "Trust and conversion review", owner: "Trust Pilot", zone: "Customer" },
      { title: "Market reach expansion", owner: "Launch Vector", zone: "Expansion" },
    ] satisfies MissionItem[],
  },
} as const;

export const bountyHuntersData = {
  ar: {
    leaders: [
      { name: "Signal Storm", score: 98, reward: "8,400 ر.س" },
      { name: "Atlas Finder", score: 96, reward: "7,200 ر.س" },
      { name: "Patch Veil", score: 95, reward: "6,900 ر.س" },
      { name: "Hive Scout", score: 94, reward: "6,300 ر.س" },
    ] satisfies BountyLeader[],
  },
  en: {
    leaders: [
      { name: "Signal Storm", score: 98, reward: "$8,400" },
      { name: "Atlas Finder", score: 96, reward: "$7,200" },
      { name: "Patch Veil", score: 95, reward: "$6,900" },
      { name: "Hive Scout", score: 94, reward: "$6,300" },
    ] satisfies BountyLeader[],
  },
} as const;

export function getOverviewData(lang: AdminLanguage = "ar") {
  return adminOverviewData[lang];
}

export function getOperationsData(lang: AdminLanguage = "ar") {
  return operationsData[lang];
}

export function getBountyData(lang: AdminLanguage = "ar") {
  return bountyHuntersData[lang];
}
