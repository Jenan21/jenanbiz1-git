import { db } from "@/lib/db";
import { getCommunityAccess } from "@/services/community/community-access-service";

export async function getAccountOverview(userId: string) {
  const [projects, memberships, listings, inquiries, fundingAssessments, jobApplications, jobPostings, campaigns, enrollments, completedLessons, fileCount, communityAccess] = await Promise.all([
    db.project.findMany({ where: { createdById: userId }, select: { id: true, name: true, status: true, currentPhase: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
    db.organizationMember.findMany({ where: { userId }, include: { organization: { select: { id: true, name: true, subscriptions: { select: { status: true, currentEnd: true } } } }, role: { select: { name: true } } }, orderBy: { updatedAt: "desc" } }),
    db.marketListing.findMany({ where: { createdById: userId }, select: { id: true, title: true, status: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
    db.marketInquiry.findMany({ where: { requesterId: userId }, select: { id: true, status: true, createdAt: true, listing: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.fundingAssessment.findMany({ where: { userId }, select: { id: true, score: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.jobApplication.findMany({ where: { applicantId: userId }, select: { id: true, status: true, createdAt: true, jobPosting: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.jobPosting.findMany({ where: { createdById: userId }, select: { id: true, title: true, status: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
    db.marketingCampaign.findMany({ where: { createdById: userId }, select: { id: true, name: true, status: true, channel: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
    db.learnerEnrollment.findMany({ where: { userId }, include: { course: { select: { id: true, title: true, lessons: { select: { id: true } } } } }, orderBy: { updatedAt: "desc" }, take: 20 }),
    db.learnerLessonCompletion.findMany({ where: { userId }, select: { lessonId: true } }),
    db.fileAsset.count({ where: { uploadedById: userId } }),
    getCommunityAccess(userId),
  ]);
  const completedLessonIds = new Set(completedLessons.map((lesson) => lesson.lessonId));
  return {
    projects,
    organizations: memberships.map((membership) => ({ id: membership.organization.id, name: membership.organization.name, membershipStatus: membership.status, isOwner: membership.isOwner, role: membership.role?.name ?? null, subscriptions: membership.organization.subscriptions })),
    services: { marketListings: listings, marketingCampaigns: campaigns, jobPostings, fileCount },
    requests: { marketInquiries: inquiries, fundingAssessments, jobApplications },
    learning: enrollments.map((enrollment) => ({ id: enrollment.id, status: enrollment.status, enrolledAt: enrollment.enrolledAt, completedAt: enrollment.completedAt, course: { id: enrollment.course.id, title: enrollment.course.title, completedLessons: enrollment.course.lessons.filter((lesson) => completedLessonIds.has(lesson.id)).length, totalLessons: enrollment.course.lessons.length } })),
    communityAccess,
  };
}