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

export type PlatformObservation = {
  title: string;
  summary: string;
  action: string;
  source: "PERSISTED_RECORDS";
};

export function buildPlatformObservations(metrics: PlatformMetrics): PlatformObservation[] {
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
      action: reviewRobots > 0 ? "راجع الروبوتات قيد المراجعة قبل اتخاذ قرار تشغيل جديد." : "لا توجد روبوتات قيد المراجعة في السجل الحالي.",
      source: "PERSISTED_RECORDS",
    },
    {
      title: "معدل اتخاذ القرار",
      summary: `معدل الموافقة المسجل ${metrics.committeeApprovalRate}% عبر مراجعات اللجنة الحالية.`,
      action: "استخدم سجل القرارات لتقييم حالات الموافقة والتأجيل قبل تغيير سياسة اللجنة.",
      source: "PERSISTED_RECORDS",
    },
    {
      title: "الكفاءة التشغيلية",
      summary: `توجد ${activeTasks} مهام نشطة و${pendingTasks} مهام معلقة، مع ${users} مستخدمًا مسجلاً ضمن ${orgs} منظمة.`,
      action: pendingTasks > 0 ? "راجع المهام المعلقة حسب الأولوية." : "لا توجد مهام بانتظار موافقة في السجل الحالي.",
      source: "PERSISTED_RECORDS",
    },
    {
      title: "مخزون الذكاء",
      summary: `${hiddenRobots} روبوتات مخفية أو مؤرشفة في السجل الحالي.`,
      action: hiddenRobots > 0 ? "راجع أسباب الإخفاء أو الأرشفة قبل إعادة أي روبوت للتشغيل." : "لا توجد روبوتات مخفية أو مؤرشفة في السجل الحالي.",
      source: "PERSISTED_RECORDS",
    },
  ];
}
