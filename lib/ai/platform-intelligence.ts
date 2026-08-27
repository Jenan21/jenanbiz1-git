export type PlatformMetrics = {
  totalRobots: number;
  visibleRobots: number;
  reviewRobots?: number;
  hiddenRobots?: number;
  averageIntelligence: number;
  committeeApprovalRate: number;
  activeTasks?: number;
  pendingTasks?: number;
  totalUsers?: number;
  totalOrganizations?: number;
};

export type PlatformInsight = {
  title: string;
  summary: string;
  confidence: number;
  action: string;
};

export function buildFallbackPlatformInsights(metrics: PlatformMetrics): PlatformInsight[] {
  const reviewRobots = metrics.reviewRobots ?? 0;
  const hiddenRobots = metrics.hiddenRobots ?? 0;
  const pendingTasks = metrics.pendingTasks ?? 0;
  const activeTasks = metrics.activeTasks ?? 0;
  const users = metrics.totalUsers ?? 0;
  const orgs = metrics.totalOrganizations ?? 0;

  return [
    {
      title: "قوة المنصة الحالية",
      summary: `يبلغ متوسط ذكاء الروبوتات ${metrics.averageIntelligence}%، مع ${metrics.visibleRobots} روبوتات نشطة في التشغيل و${reviewRobots} قيد المراجعة.`,
      confidence: Math.min(99, Math.max(65, metrics.averageIntelligence)),
      action: "استمرار التوسع في التشغيل مع مراجعة الروبوتات المعلقة قبل الترقية.",
    },
    {
      title: "معدل اتخاذ القرار",
      summary: `معدل الموافقة الحالي ${metrics.committeeApprovalRate}%، وهو ما يدل على أن القرار الإداري يتم بشكل مستقر في أغلب المهام.`,
      confidence: Math.min(98, Math.max(60, metrics.committeeApprovalRate)),
      action: "الحفاظ على مراجعة اللجنة على المهام ذات الأولوية العالية فقط.",
    },
    {
      title: "الكفاءة التشغيلية",
      summary: `توجد ${activeTasks} مهام نشطة و${pendingTasks} مهام معلقة، بينما يشير عدد المستخدمين ${users} داخل ${orgs} منظمة إلى أن المنصة في مرحلة نمو مستقر.`,
      confidence: Math.min(95, Math.max(68, Math.round((metrics.visibleRobots / Math.max(1, metrics.totalRobots)) * 100))),
      action: "توزيع المهام حسب الأولويات لتقليل الوقت الضائع وتحسين سرعة التنفيذ.",
    },
    {
      title: "مخزون الذكاء",
      summary: `${hiddenRobots} روبوتات مخفية أو غير منشورة، وهي تمثل فرصة للتحسين أو إعادة التقييم في الجولات القادمة.`,
      confidence: Math.min(92, Math.max(55, 100 - hiddenRobots * 10)),
      action: "إعادة تقييم الروبوتات المخفية لتحديد ما إذا كانت تستحق العودة إلى التشغيل أم التحديث.",
    },
  ];
}
