import { db } from "@/lib/db";

export type AdminSummary = {
  totalRobots: number;
  visibleRobots: number;
  reviewRobots: number;
  hiddenRobots: number;
  averageIntelligence: number;
  averageSkill: number;
  averageExperience: number;
  totalTasks: number;
  activeTasks: number;
  pendingTasks: number;
  completedTasks: number;
  committeeAverageScore: number;
  committeeApprovalRate: number;
  committeeReviews: number;
  totalUsers: number;
  activeUsers: number;
  totalOrganizations: number;
  totalRoles: number;
  leaders: Array<{ name: string; score: number; reward: string }>;
  reports: Array<{ title: string; value: string; detail: string }>;
  pipelineStages: Array<{ stage: string; count: number; detail: string }>;
  healthServices: Array<{ label: string; value: string; detail: string }>;
  knowledgeLayers: Array<{ label: string; value: string; detail: string }>;
  growthChannels: Array<{ label: string; value: string; detail: string }>;
  skillChart: Array<{ name: string; score: number }>;
  branches: Array<{ name: string; members: number; status: string; health: string }>;
  missionAssignments: Array<{
    name: string;
    requiredScore: number;
    assignedRobots: string[];
    totalSkillGain: number;
  }>;
  totalSkillGain: number;
  readyRobots: number;
  revenue: { succeededMinor: number; pendingMinor: number; currency: string };
  execution: { successful: number; failed: number; successRate: number };
  verifiedEvidence: number;
  unverifiedEvidence: number;
  topRobots: Array<{ id: string; name: string; team: string | null; status: string; intelligence: number; skill: number; experience: number; tasks: number; verifiedEvidence: number }>;
  recentAudit: Array<{ action: string; entityType: string; createdAt: string }>;
};

export async function getPlatformAdminSummary(): Promise<AdminSummary> {
  const [robots, tasks, reviews, organizations, recentAudit] = await Promise.all([
    db.robot.findMany({
      orderBy: { intelligence: "desc" },
      take: 50,
      include: { _count: { select: { tasks: true, evidence: true } } },
    }),
    db.robotTask.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    db.committeeReview.findMany({
      orderBy: { score: "desc" },
      take: 50,
    }),
    db.organization.findMany({
      include: { members: true },
      take: 8,
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { action: true, entityType: true, createdAt: true } }),
  ]);

  const [
    totalUsers, activeUsers, totalOrganizations, totalRoles, completedProjects, publishedListings, publishedJobPostings,
    activeCampaigns, activeCommunityGrants, activeSocialLinks, sharedKnowledgeCount, learningLogCount, robotCounts, robotAverages,
    succeededPayments, pendingPayments, executionTotal, executionSuccessful, evidenceTotal, verifiedEvidenceTotal,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { status: "ACTIVE" } }),
    db.organization.count(),
    db.role.count(),
    db.project.count({ where: { status: "COMPLETED" } }),
    db.marketListing.count({ where: { status: "PUBLISHED" } }),
    db.jobPosting.count({ where: { status: "PUBLISHED" } }),
    db.marketingCampaign.count({ where: { status: "ACTIVE" } }),
    db.communityAccessGrant.count({ where: { status: "ACTIVE" } }),
    db.platformSocialLink.count({ where: { isActive: true } }),
    db.sharedKnowledge.count(),
    db.learningLog.count(),
    db.robot.groupBy({ by: ["status"], _count: { _all: true } }),
    db.robot.aggregate({ _avg: { intelligence: true, skill: true, experience: true } }),
    db.payment.aggregate({ where: { status: "SUCCEEDED" }, _sum: { amountMinor: true } }),
    db.payment.aggregate({ where: { status: "PENDING" }, _sum: { amountMinor: true } }),
    db.modelExecution.count(),
    db.modelExecution.count({ where: { success: true } }),
    db.evidence.count(),
    db.evidence.count({ where: { verified: true } }),
  ]);

  const totalRobots = await db.robot.count();
  const countByStatus = (status: string) => robotCounts.find((entry) => entry.status === status)?._count._all ?? 0;
  const visibleRobots = countByStatus("ACTIVE");
  const reviewRobots = countByStatus("REVIEW");
  const hiddenRobots = countByStatus("HIDDEN") + countByStatus("ARCHIVED");
  const averageIntelligence = Math.round(robotAverages._avg.intelligence ?? 0);
  const averageSkill = Math.round(robotAverages._avg.skill ?? 0);
  const averageExperience = Math.round(robotAverages._avg.experience ?? 0);

  const totalTasks = await db.robotTask.count();
  const [activeTasks, pendingTasks, completedTasks] = await Promise.all([
    db.robotTask.count({ where: { status: { in: ["ACTIVE", "IN_PROGRESS"] } } }),
    db.robotTask.count({ where: { status: "PENDING_APPROVAL" } }),
    db.robotTask.count({ where: { status: "COMPLETED" } }),
  ]);
  const committeeAverageScore = reviews.length
    ? Math.round(reviews.reduce((sum, review) => sum + review.score, 0) / reviews.length)
    : 0;
  const committeeApprovalRate = reviews.length
    ? Math.round((reviews.filter((review) => review.verdict === "APPROVE").length / reviews.length) * 100)
    : 0;
  const succeededMinor = succeededPayments._sum.amountMinor ?? 0;
  const pendingMinor = pendingPayments._sum.amountMinor ?? 0;
  const successfulExecutions = executionSuccessful;
  const executionFailures = executionTotal - executionSuccessful;
  const verifiedEvidence = verifiedEvidenceTotal;
  const unverifiedEvidence = evidenceTotal - verifiedEvidenceTotal;

  const leaders = robots.slice(0, 4).map((robot) => ({
    name: robot.name,
    score: robot.intelligence,
    reward: robot.team ?? "No team assigned",
  }));

  const reports = [
    { title: "المستخدمون النشطون", value: String(activeUsers), detail: `من ${totalUsers} مستخدمًا مسجلاً` },
    { title: "المشاريع المكتملة", value: String(completedProjects), detail: "سجلات مشروع بحالة مكتملة" },
    { title: "آخر مهمة محدثة", value: tasks[0]?.title ?? "—", detail: tasks[0] ? "من سجل مهام الروبوتات" : "لا توجد مهام مسجلة" },
    { title: "معدل موافقة اللجنة", value: `${committeeApprovalRate}%`, detail: `${reviews.length} مراجعة مسجلة` },
  ];

  const pipelineStages = [
    { stage: "موافق", count: visibleRobots, detail: "منظومة جاهزة للنشر" },
    { stage: "قيد المراجعة", count: reviewRobots, detail: "يحتاج مراجعة اللجنة" },
    { stage: "معلق", count: pendingTasks, detail: "مهام تنتظر الموافقة" },
    { stage: "نشط", count: activeTasks, detail: "مهام قيد التنفيذ" },
  ];

  const healthServices = [
    { label: "وقت التشغيل", value: "—", detail: "يتطلب مصدر مراقبة معتمد" },
    { label: "تنفيذات النموذج", value: `${successfulExecutions}/${executionTotal}`, detail: "تنفيذات ناجحة من السجل" },
    { label: "أدلة غير موثقة", value: String(unverifiedEvidence), detail: "تحتاج تحققًا يدويًا" },
    { label: "مهام معلقة", value: String(pendingTasks), detail: "بانتظار موافقة" },
  ];

  const knowledgeLayers = [
    { label: "روبوتات مسجلة", value: String(totalRobots), detail: "من سجل الروبوتات" },
    { label: "معرفة مشتركة", value: String(sharedKnowledgeCount), detail: "سجلات معرفة محفوظة" },
    { label: "سجل التعلم", value: String(learningLogCount), detail: "نتائج تعلم مسجلة" },
    { label: "أدلة موثقة", value: String(verifiedEvidence), detail: "من سجل الأدلة" },
  ];

  const growthChannels = [
    { label: "روابط JenanBIZ النشطة", value: String(activeSocialLinks), detail: "قنوات اجتماعية مهيأة" },
    { label: "عضويات المجتمع", value: String(activeCommunityGrants), detail: "منح وصول نشطة" },
    { label: "حملات تسويق نشطة", value: String(activeCampaigns), detail: "من سجل الحملات" },
    { label: "إدراجات وفرص منشورة", value: String(publishedListings + publishedJobPostings), detail: "السوق والمواهب" },
  ];

  const skillChart = robots.slice(0, 6).map((robot) => ({
    name: robot.name,
    score: robot.intelligence,
  }));

  const missionAssignments = [
    { name: "Intelligence at least 90", requiredScore: 90, assignedRobots: robots.filter((robot) => robot.intelligence >= 90).slice(0, 3).map((robot) => robot.name), totalSkillGain: robots.filter((robot) => robot.intelligence >= 90).slice(0, 3).reduce((sum, robot) => sum + robot.skill, 0) },
    { name: "Intelligence at least 88", requiredScore: 88, assignedRobots: robots.filter((robot) => robot.intelligence >= 88).slice(0, 3).map((robot) => robot.name), totalSkillGain: robots.filter((robot) => robot.intelligence >= 88).slice(0, 3).reduce((sum, robot) => sum + robot.skill, 0) },
    { name: "Intelligence at least 80", requiredScore: 80, assignedRobots: robots.filter((robot) => robot.intelligence >= 80).slice(0, 3).map((robot) => robot.name), totalSkillGain: robots.filter((robot) => robot.intelligence >= 80).slice(0, 3).reduce((sum, robot) => sum + robot.skill, 0) },
  ];

  const totalSkillGain = missionAssignments.reduce((sum, mission) => sum + mission.totalSkillGain, 0);
  const readyRobots = robots.filter((robot) => robot.intelligence >= 85).length;

  const branches = organizations.map((organization) => ({
    name: organization.name,
    members: organization.members.length,
    status: organization.members.some((member) => member.status === "ACTIVE") ? "نشط" : "بلا أعضاء نشطين",
    health: `${organization.members.filter((member) => member.status === "ACTIVE").length}/${organization.members.length} أعضاء نشطون`,
  }));

  return {
    totalRobots,
    visibleRobots,
    reviewRobots,
    hiddenRobots,
    averageIntelligence,
    averageSkill,
    averageExperience,
    totalTasks,
    activeTasks,
    pendingTasks,
    completedTasks,
    committeeAverageScore,
    committeeApprovalRate,
    committeeReviews: reviews.length,
    totalUsers,
    activeUsers,
    totalOrganizations,
    totalRoles,
    leaders,
    reports,
    pipelineStages,
    healthServices,
    knowledgeLayers,
    growthChannels,
    skillChart,
    branches,
    missionAssignments,
    totalSkillGain,
    readyRobots,
    revenue: { succeededMinor, pendingMinor, currency: "SAR" },
    execution: { successful: successfulExecutions, failed: executionFailures, successRate: executionTotal ? Math.round((successfulExecutions / executionTotal) * 100) : 0 },
    verifiedEvidence,
    unverifiedEvidence,
    topRobots: robots.map((robot) => ({ id: robot.id, name: robot.name, team: robot.team, status: robot.status, intelligence: robot.intelligence, skill: robot.skill, experience: robot.experience, tasks: robot._count.tasks, verifiedEvidence: robot._count.evidence })).slice(0, 50),
    recentAudit: recentAudit.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
  };
}
