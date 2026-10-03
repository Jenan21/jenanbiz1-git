import { JobApplicationStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const activeMessageStatuses: JobApplicationStatus[] = [JobApplicationStatus.SUBMITTED, JobApplicationStatus.UNDER_REVIEW, JobApplicationStatus.ACCEPTED];

export async function sendTalentMessage(input: { applicationId: string; body: string }, userId: string) {
  const application = await db.jobApplication.findFirst({ where: { id: input.applicationId }, select: { id: true, applicantId: true, status: true, jobPosting: { select: { createdById: true, id: true, title: true } } } });
  if (!application) throw new Error("Job application not found");
  const employerId = application.jobPosting.createdById;
  if (userId !== application.applicantId && userId !== employerId) throw new Error("Talent conversation access required");
  if (!activeMessageStatuses.includes(application.status)) throw new Error("Talent conversation is closed");
  const recipientId = userId === application.applicantId ? employerId : application.applicantId;
  return db.$transaction(async (transaction) => {
    const message = await transaction.talentMessage.create({ data: { applicationId: application.id, senderId: userId, body: input.body.trim() }, include: { sender: { select: { profile: { select: { displayName: true } } } } } });
    await transaction.notification.create({ data: { userId: recipientId, type: "TALENT_MESSAGE", title: "New hiring conversation message", body: `A participant sent a message about ${application.jobPosting.title}.`, data: { applicationId: application.id, jobPostingId: application.jobPosting.id, messageId: message.id } } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "talent.message.sent", entityType: "TalentMessage", entityId: message.id, metadata: { applicationId: application.id, recipientId } } });
    return message;
  });
}