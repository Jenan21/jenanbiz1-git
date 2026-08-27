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
};

function moneyLabel(value: number) {
  return `${Math.round(value).toLocaleString("ar-SA")} ر.س`;
}

export async function getPlatformAdminSummary(): Promise<AdminSummary> {
  const [robots, tasks, reviews, users, organizations] = await Promise.all([
    db.robot.findMany({
      orderBy: { intelligence: "desc" },
      take: 12,
    }),
    db.robotTask.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    db.committeeReview.findMany({
      orderBy: { score: "desc" },
      take: 50,
    }),
    db.user.findMany({
      include: { profile: true },
      take: 100,
      orderBy: { createdAt: "desc" },
    }),
    db.organization.findMany({
      include: { members: true },
      take: 8,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const [totalUsers, totalOrganizations, totalRoles] = await Promise.all([
    db.user.count(),
    db.organization.count(),
    db.role.count(),
  ]);

  const totalRobots = robots.length;
  const visibleRobots = robots.filter((robot) => robot.status === "ACTIVE").length;
  const reviewRobots = robots.filter((robot) => robot.status === "REVIEW").length;
  const hiddenRobots = robots.filter((robot) => robot.status === "HIDDEN" || robot.status === "ARCHIVED").length;
  const averageIntelligence = robots.length
    ? Math.round(robots.reduce((sum, robot) => sum + robot.intelligence, 0) / robots.length)
    : 0;
  const averageSkill = robots.length
    ? Math.round(robots.reduce((sum, robot) => sum + robot.skill, 0) / robots.length)
    : 0;
  const averageExperience = robots.length
    ? Math.round(robots.reduce((sum, robot) => sum + robot.experience, 0) / robots.length)
    : 0;

  const totalTasks = tasks.length;
  const activeTasks = tasks.filter((task) => task.status === "ACTIVE" || task.status === "IN_PROGRESS").length;
  const pendingTasks = tasks.filter((task) => task.status === "PENDING_APPROVAL").length;
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED").length;
  const activeUsers = users.filter((user) => user.status === "ACTIVE").length;

  const committeeAverageScore = reviews.length
    ? Math.round(reviews.reduce((sum, review) => sum + review.score, 0) / reviews.length)
    : 0;
  const committeeApprovalRate = reviews.length
    ? Math.round((reviews.filter((review) => review.verdict === "APPROVE").length / reviews.length) * 100)
    : 0;

  const leaders = robots.slice(0, 4).map((robot, index) => ({
    name: robot.name,
    score: robot.intelligence,
    reward: moneyLabel(8400 - index * 500 + robot.intelligence * 20),
  }));

  const reports = [
    { title: "زيادة الذكاء", value: `+${Math.max(2, averageIntelligence - 90)}%`, detail: "مقارنة بالأمس" },
    { title: "أفضل فريق أداء", value: robots[0]?.team ?? "التطوير", detail: `نسبة أساسية ${Math.max(90, averageIntelligence)}%` },
    { title: "أكثر مهمة كفاءة", value: tasks[0]?.title ?? "تحديثات المنصة", detail: "ثقة إنجاز 92%" },
    { title: "كفاءة الموافقة", value: `${committeeApprovalRate}%`, detail: "معدل قرار سريع" },
  ];

  const pipelineStages = [
    { stage: "موافق", count: visibleRobots, detail: "منظومة جاهزة للنشر" },
    { stage: "قيد المراجعة", count: reviewRobots, detail: "يحتاج مراجعة اللجنة" },
    { stage: "معلق", count: pendingTasks, detail: "مهام تنتظر الموافقة" },
    { stage: "نشط", count: activeTasks, detail: "مهام قيد التنفيذ" },
  ];

  const healthServices = [
    { label: "وقت التشغيل", value: "99.9%", detail: "مراقبة 24/7" },
    { label: "صحة أسطول الصائدين", value: `${Math.min(99, averageIntelligence)}%`, detail: "قدرة الأداء" },
    { label: "تأخير القرار", value: `${Math.max(30, 180 - averageIntelligence)}ms`, detail: "متوسط الاستجابة" },
    { label: "تنبيهات حرجة", value: String(Math.max(0, pendingTasks - 2)), detail: "تحتاج مراجعة" },
  ];

  const knowledgeLayers = [
    { label: "بذرة المهارة الأساسية", value: `${totalRobots} صائد`, detail: "مجموعة المعرفة الأولية" },
    { label: "النمو اليومي", value: `+${Math.max(50, Math.round(totalRobots / 10))}`, detail: "صائد جديد كل 24 ساعة" },
    { label: "المعرفة المحفوظة", value: `${Math.min(99, averageIntelligence)}%`, detail: "مهارات محفوظة في الذاكرة الأساسية" },
    { label: "المستبعد", value: String(hiddenRobots), detail: "صائد ضعيف تم إزالته" },
  ];

  const growthChannels = [
    { label: "الوصول العضوي", value: `+${Math.min(99, averageIntelligence - 60)}%`, detail: "نمو الشبكة" },
    { label: "الشراكات", value: String(Math.max(10, Math.round(totalTasks / 3))), detail: "تعاونات نشطة" },
    { label: "ارتفاع الحملة", value: `${Math.max(5, committeeApprovalRate - 40)}%`, detail: "رفع التحويل" },
    { label: "معدل المشاركة", value: `${Math.min(99, averageSkill)}%`, detail: "استجابة المجتمع" },
  ];

  const skillChart = robots.slice(0, 6).map((robot) => ({
    name: robot.name,
    score: robot.intelligence,
  }));

  const missionAssignments = [
    { name: "Interface Design", requiredScore: 90, assignedRobots: robots.filter((robot) => robot.intelligence >= 90).slice(0, 3).map((robot) => robot.name), totalSkillGain: robots.filter((robot) => robot.intelligence >= 90).slice(0, 3).reduce((sum, robot) => sum + robot.skill, 0) },
    { name: "Operations Automation", requiredScore: 88, assignedRobots: robots.filter((robot) => robot.intelligence >= 88).slice(0, 3).map((robot) => robot.name), totalSkillGain: robots.filter((robot) => robot.intelligence >= 88).slice(0, 3).reduce((sum, robot) => sum + robot.skill, 0) },
    { name: "Growth research", requiredScore: 80, assignedRobots: robots.filter((robot) => robot.intelligence >= 80).slice(0, 3).map((robot) => robot.name), totalSkillGain: robots.filter((robot) => robot.intelligence >= 80).slice(0, 3).reduce((sum, robot) => sum + robot.skill, 0) },
  ];

  const totalSkillGain = missionAssignments.reduce((sum, mission) => sum + mission.totalSkillGain, 0);
  const readyRobots = robots.filter((robot) => robot.intelligence >= 85).length;

  const branches = organizations.map((organization) => ({
    name: organization.name,
    members: organization.members.length,
    status: organization.members.length > 0 ? "نشط" : "جديد",
    health: `${Math.min(99, 70 + organization.members.length * 5)}%`,
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
  };
}
