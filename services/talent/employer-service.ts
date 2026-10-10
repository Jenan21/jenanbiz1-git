import { db } from "@/lib/db";
import { requireSoftwareMembership } from "@/services/software/software-access";

const shortlistMemberInclude = {
  candidateProfile: {
    select: {
      id: true,
      headline: true,
      summary: true,
      city: true,
      countryCode: true,
      yearsExperience: true,
      skills: true,
      desiredWorkModes: true,
      availability: true,
      updatedAt: true,
      user: { select: { profile: { select: { displayName: true } } } },
    },
  },
} as const;

export async function listEmployerTalentResources(userId: string) {
  const [shortlists, supportTickets] = await Promise.all([
    db.talentShortlist.findMany({
      where: { ownerId: userId },
      include: {
        organization: { select: { id: true, name: true } },
        members: {
          where: { candidateProfile: { isDiscoverable: true } },
          include: shortlistMemberInclude,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.talentSupportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);
  return { shortlists, supportTickets };
}

export async function createTalentShortlist(
  input: { description?: string; name: string; organizationId?: string },
  userId: string,
) {
  if (input.organizationId) await requireSoftwareMembership(input.organizationId, userId, true);
  return db.$transaction(async (transaction) => {
    const shortlist = await transaction.talentShortlist.create({
      data: {
        ownerId: userId,
        organizationId: input.organizationId,
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
      },
      include: { organization: { select: { id: true, name: true } }, members: { include: shortlistMemberInclude } },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.shortlist.created", entityType: "TalentShortlist", entityId: shortlist.id },
    });
    return shortlist;
  });
}

export async function deleteTalentShortlist(shortlistId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const shortlist = await transaction.talentShortlist.findFirst({ where: { id: shortlistId, ownerId: userId }, select: { id: true } });
    if (!shortlist) throw new Error("Talent shortlist not found");
    await transaction.talentShortlist.delete({ where: { id: shortlist.id } });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.shortlist.deleted", entityType: "TalentShortlist", entityId: shortlist.id },
    });
    return { shortlistId };
  });
}

export async function addTalentShortlistMember(shortlistId: string, candidateProfileId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const [shortlist, candidate] = await Promise.all([
      transaction.talentShortlist.findFirst({ where: { id: shortlistId, ownerId: userId }, select: { id: true } }),
      transaction.talentProfile.findFirst({ where: { id: candidateProfileId, isDiscoverable: true }, select: { id: true } }),
    ]);
    if (!shortlist) throw new Error("Talent shortlist not found");
    if (!candidate) throw new Error("Discoverable talent profile not found");
    const member = await transaction.talentShortlistMember.upsert({
      where: { shortlistId_candidateProfileId: { shortlistId, candidateProfileId } },
      create: { shortlistId, candidateProfileId },
      update: {},
      include: shortlistMemberInclude,
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.shortlist.member.added", entityType: "TalentShortlistMember", entityId: member.id, metadata: { shortlistId, candidateProfileId } },
    });
    return member;
  });
}

export async function removeTalentShortlistMember(shortlistId: string, candidateProfileId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const shortlist = await transaction.talentShortlist.findFirst({ where: { id: shortlistId, ownerId: userId }, select: { id: true } });
    if (!shortlist) throw new Error("Talent shortlist not found");
    const removed = await transaction.talentShortlistMember.deleteMany({ where: { shortlistId, candidateProfileId } });
    if (!removed.count) throw new Error("Talent shortlist member not found");
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.shortlist.member.removed", entityType: "TalentProfile", entityId: candidateProfileId, metadata: { shortlistId } },
    });
    return { shortlistId, candidateProfileId };
  });
}

export async function saveTalentCompanyProfile(
  input: {
    city?: string;
    countryCode?: string;
    description?: string;
    employeeRange?: string;
    industry?: string;
    organizationId: string;
    website?: string;
  },
  userId: string,
) {
  await requireSoftwareMembership(input.organizationId, userId, true);
  return db.$transaction(async (transaction) => {
    const organization = await transaction.organization.update({
      where: { id: input.organizationId },
      data: {
        city: input.city?.trim() || null,
        countryCode: input.countryCode?.trim().toUpperCase() || null,
        description: input.description?.trim() || null,
        employeeRange: input.employeeRange?.trim() || null,
        industry: input.industry?.trim() || null,
        website: input.website?.trim() || null,
      },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.company.profile.saved", entityType: "Organization", entityId: organization.id },
    });
    return organization;
  });
}

export async function saveTalentHiringSettings(
  organizationId: string,
  settings: { defaultWorkMode?: string; interviewDuration?: number; notificationsEnabled?: boolean },
  userId: string,
) {
  await requireSoftwareMembership(organizationId, userId, true);
  return db.$transaction(async (transaction) => {
    const organization = await transaction.organization.update({
      where: { id: organizationId },
      data: { hiringSettings: settings },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.company.settings.saved", entityType: "Organization", entityId: organization.id },
    });
    return organization;
  });
}

export async function createTalentSupportTicket(
  input: { category: string; description: string; subject: string },
  userId: string,
) {
  return db.$transaction(async (transaction) => {
    const ticket = await transaction.talentSupportTicket.create({
      data: {
        userId,
        category: input.category,
        description: input.description.trim(),
        subject: input.subject.trim(),
      },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.support.created", entityType: "TalentSupportTicket", entityId: ticket.id },
    });
    return ticket;
  });
}
