import { randomUUID } from "node:crypto";
import { ProjectInvitationStatus, ProjectMemberRole, type Prisma } from "@/generated/prisma/client";
import { emailVerificationRequired, requireVerifiedEmail } from "@/lib/auth/email-verification-policy";
import { db } from "@/lib/db";
import type { DeliveryScheduler } from "@/services/auth/email-verification-service";
import { getEmailProvider } from "@/services/mail/email-provider";
import { projectInvitationEmail } from "@/services/mail/templates";
import type { EmailProvider } from "@/services/providers.contracts";

export const PROJECT_INVITATION_LIFETIME_MS = 14 * 86_400_000;
/** A repeated invitation to the same address, role and project inside this window is recorded but not mailed again. */
const REMAIL_QUIET_MS = 10 * 60_000;
const MAX_OPEN_INVITATIONS_PER_PROJECT = 50;
const MAX_INVITATIONS_PER_PERSON_PER_DAY = 40;

export type InvitableRole = "EDITOR" | "REVIEWER" | "VIEWER";
export type InvitationDelivery = "email" | "skipped" | "unavailable";

const ownerWhere = (userId: string): Prisma.ProjectWhereInput => ({
  OR: [{ createdById: userId }, { members: { some: { userId, role: ProjectMemberRole.OWNER } } }],
});

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const invitationNotFound = () => new Error("Invitation not found");

/**
 * Invites an address to a project. Nothing about the address is looked up: the invitation waits for whoever signs in
 * with it and accepts, so the answer is the same whether or not an account exists and the sender learns nothing new.
 */
export async function inviteProjectMember(
  projectId: string,
  input: { email: string; role: InvitableRole },
  userId: string,
  options: { provider?: EmailProvider | null; schedule?: DeliveryScheduler } = {},
) {
  await requireVerifiedEmail(userId);
  const email = normalizeEmail(input.email);
  const now = new Date();
  const outcome = await db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({ where: { id: projectId, ...ownerWhere(userId) }, select: { id: true, name: true } });
    if (!project) throw new Error("Project owner access required");
    const inviter = await transaction.user.findUnique({ where: { id: userId }, select: { email: true, profile: { select: { displayName: true } } } });
    if (!inviter) throw new Error("Project owner access required");
    if (inviter.email.toLowerCase() === email) throw new Error("Project owner is already a member");
    const alreadyMember = await transaction.projectMember.count({ where: { projectId, user: { email } } });
    if (alreadyMember > 0) throw new Error("This person is already a project member");

    const existing = await transaction.projectInvitation.findUnique({ where: { projectId_email: { projectId, email } } });
    const existingIsOpen = existing?.status === ProjectInvitationStatus.PENDING && existing.expiresAt > now;
    if (!existingIsOpen) {
      const open = await transaction.projectInvitation.count({ where: { projectId, status: ProjectInvitationStatus.PENDING, expiresAt: { gt: now } } });
      if (open >= MAX_OPEN_INVITATIONS_PER_PROJECT) throw new Error("This project has too many open invitations; cancel some first");
      const sentToday = await transaction.projectInvitation.count({ where: { invitedById: userId, updatedAt: { gt: new Date(now.getTime() - 86_400_000) } } });
      if (sentToday >= MAX_INVITATIONS_PER_PERSON_PER_DAY) throw new Error("Daily invitation limit reached; try again tomorrow");
    }

    const expiresAt = new Date(now.getTime() + PROJECT_INVITATION_LIFETIME_MS);
    const invitation = await transaction.projectInvitation.upsert({
      where: { projectId_email: { projectId, email } },
      create: { projectId, email, role: input.role, invitedById: userId, expiresAt },
      update: { role: input.role, invitedById: userId, status: ProjectInvitationStatus.PENDING, expiresAt, respondedAt: null },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "project.invitation.sent", entityType: "ProjectInvitation", entityId: invitation.id, metadata: { projectId, role: input.role } },
    });
    const recentlyMailed = existingIsOpen && existing.role === input.role && now.getTime() - existing.updatedAt.getTime() < REMAIL_QUIET_MS;
    return { invitation, projectName: project.name, inviterName: inviter.profile?.displayName ?? "", recentlyMailed };
  });

  const provider = options.provider === undefined ? getEmailProvider() : options.provider;
  const delivery: InvitationDelivery = outcome.recentlyMailed ? "skipped" : provider ? "email" : "unavailable";
  if (delivery === "email" && provider) {
    const traceId = randomUUID();
    const deliver = async () => {
      const message = projectInvitationEmail({ inviterName: outcome.inviterName, projectName: outcome.projectName, role: input.role });
      try {
        await provider.send({ html: message.html, subject: message.subject, text: message.text, to: email, traceId });
        await db.auditLog.create({
          data: { actorId: userId, action: "project.invitation.delivered", entityType: "ProjectInvitation", entityId: outcome.invitation.id, metadata: { provider: provider.name, traceId } },
        });
      } catch {
        await db.auditLog.create({
          data: { actorId: userId, action: "project.invitation.delivery_failed", entityType: "ProjectInvitation", entityId: outcome.invitation.id, metadata: { provider: provider.name, traceId } },
        });
      }
    };
    if (options.schedule) options.schedule(() => deliver().catch(() => console.error("Project invitation delivery bookkeeping failed", traceId)));
    else await deliver();
  }
  return { invitation: presentSentInvitation(outcome.invitation), delivery };
}

function presentSentInvitation(invitation: { id: string; projectId: string; email: string; role: ProjectMemberRole; status: ProjectInvitationStatus; expiresAt: Date; createdAt: Date }) {
  return {
    id: invitation.id,
    projectId: invitation.projectId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
}

/**
 * Invitations the owner has sent that are still waiting, for every project they own. The owner typed these
 * addresses, so showing them back reveals nothing.
 */
export async function listSentProjectInvitations(userId: string) {
  const invitations = await db.projectInvitation.findMany({
    where: { status: ProjectInvitationStatus.PENDING, expiresAt: { gt: new Date() }, project: ownerWhere(userId) },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return invitations.map(presentSentInvitation);
}

/**
 * Invitations waiting for the signed-in person. They are matched on the account's address and shown only once that
 * address is verified, so registering with someone else's address exposes nothing.
 */
export async function listReceivedProjectInvitations(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
  if (!user) return { invitations: [], requiresVerification: false };
  if (emailVerificationRequired() && !user.emailVerifiedAt) return { invitations: [], requiresVerification: true };
  const invitations = await db.projectInvitation.findMany({
    where: { email: normalizeEmail(user.email), status: ProjectInvitationStatus.PENDING, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      project: { select: { id: true, name: true } },
      invitedBy: { select: { profile: { select: { displayName: true } } } },
    },
  });
  return {
    invitations: invitations.map(({ invitedBy, ...invitation }) => ({ ...invitation, invitedByName: invitedBy.profile?.displayName ?? null })),
    requiresVerification: false,
  };
}

/** Loads an invitation only for the account it was sent to; every other case looks the same as "does not exist". */
async function ownInvitation(transaction: Prisma.TransactionClient, invitationId: string, userId: string) {
  const user = await transaction.user.findUnique({ where: { id: userId }, select: { email: true } });
  const invitation = await transaction.projectInvitation.findUnique({ where: { id: invitationId } });
  if (!user || !invitation || invitation.email !== normalizeEmail(user.email)) throw invitationNotFound();
  return invitation;
}

export async function acceptProjectInvitation(invitationId: string, userId: string) {
  await requireVerifiedEmail(userId);
  return db.$transaction(async (transaction) => {
    const invitation = await ownInvitation(transaction, invitationId, userId);
    const now = new Date();
    if (invitation.status !== ProjectInvitationStatus.PENDING) throw new Error("This invitation is no longer open");
    if (invitation.expiresAt <= now) throw new Error("This invitation has expired");
    // The conditional update makes a double click, or two devices, accept it only once.
    const claimed = await transaction.projectInvitation.updateMany({
      where: { id: invitation.id, status: ProjectInvitationStatus.PENDING, expiresAt: { gt: now } },
      data: { status: ProjectInvitationStatus.ACCEPTED, respondedAt: now },
    });
    if (claimed.count === 0) throw new Error("This invitation is no longer open");
    // Someone who already belongs to the project keeps the role they have, so an invitation can never lower an owner.
    const existing = await transaction.projectMember.findUnique({ where: { projectId_userId: { projectId: invitation.projectId, userId } } });
    const member = existing ?? (await transaction.projectMember.create({ data: { projectId: invitation.projectId, userId, addedById: invitation.invitedById, role: invitation.role } }));
    await transaction.auditLog.create({
      data: { actorId: userId, action: "project.invitation.accepted", entityType: "ProjectInvitation", entityId: invitation.id, metadata: { projectId: invitation.projectId, role: member.role } },
    });
    return { projectId: invitation.projectId, role: member.role };
  });
}

export async function declineProjectInvitation(invitationId: string, userId: string) {
  await requireVerifiedEmail(userId);
  return db.$transaction(async (transaction) => {
    const invitation = await ownInvitation(transaction, invitationId, userId);
    const declined = await transaction.projectInvitation.updateMany({
      where: { id: invitation.id, status: ProjectInvitationStatus.PENDING },
      data: { status: ProjectInvitationStatus.DECLINED, respondedAt: new Date() },
    });
    if (declined.count === 0) throw new Error("This invitation is no longer open");
    await transaction.auditLog.create({
      data: { actorId: userId, action: "project.invitation.declined", entityType: "ProjectInvitation", entityId: invitation.id, metadata: { projectId: invitation.projectId } },
    });
    return { projectId: invitation.projectId };
  });
}

export async function revokeProjectInvitation(projectId: string, invitationId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({ where: { id: projectId, ...ownerWhere(userId) }, select: { id: true } });
    if (!project) throw new Error("Project owner access required");
    const revoked = await transaction.projectInvitation.updateMany({
      where: { id: invitationId, projectId, status: ProjectInvitationStatus.PENDING },
      data: { status: ProjectInvitationStatus.REVOKED, respondedAt: new Date() },
    });
    if (revoked.count === 0) throw invitationNotFound();
    await transaction.auditLog.create({
      data: { actorId: userId, action: "project.invitation.revoked", entityType: "ProjectInvitation", entityId: invitationId, metadata: { projectId } },
    });
    return { id: invitationId };
  });
}
