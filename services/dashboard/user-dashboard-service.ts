import { db } from "@/lib/db";
import { getAccountOverview } from "@/services/account/account-overview-service";

export async function getUserDashboard(userId: string) {
  const [account, unreadNotifications, recentActivity, projectTotal, activeProjects, organizationTotal, activeMemberships, openMarketInquiries, openJobApplications, fundingAssessments, enrolledCourses, completedCourses, marketListings, marketingCampaigns, jobPostings, fileCount] = await Promise.all([
    getAccountOverview(userId),
    db.notification.count({ where: { userId, status: "UNREAD" } }),
    db.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
    }),
    db.project.count({ where: { createdById: userId } }),
    db.project.count({ where: { createdById: userId, status: { in: ["ANALYSIS", "FEASIBILITY", "EVALUATION", "APPROVED", "IN_PROGRESS"] } } }),
    db.organizationMember.count({ where: { userId } }),
    db.organizationMember.count({ where: { userId, status: "ACTIVE" } }),
    db.marketInquiry.count({ where: { requesterId: userId, status: { not: "CLOSED" } } }),
    db.jobApplication.count({ where: { applicantId: userId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    db.fundingAssessment.count({ where: { userId } }),
    db.learnerEnrollment.count({ where: { userId } }),
    db.learnerEnrollment.count({ where: { userId, status: "COMPLETED" } }),
    db.marketListing.count({ where: { createdById: userId } }),
    db.marketingCampaign.count({ where: { createdById: userId } }),
    db.jobPosting.count({ where: { createdById: userId } }),
    db.fileAsset.count({ where: { uploadedById: userId } }),
  ]);
  const openRequests = openMarketInquiries + openJobApplications;
  const servicesCount = marketListings + marketingCampaigns + jobPostings + fileCount;

  return {
    metrics: {
      projects: { total: projectTotal, active: activeProjects },
      organizations: { total: organizationTotal, activeMemberships },
      requests: { open: openRequests, fundingAssessments },
      learning: { enrolled: enrolledCourses, completed: completedCourses },
      services: { total: servicesCount, files: fileCount },
      notifications: { unread: unreadNotifications },
      communityAccess: account.communityAccess.hasAccess,
    },
    recentActivity: recentActivity.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })),
    account,
  };
}