import { randomUUID } from "node:crypto";
import { Prisma, SystemRole, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { RegisterData } from "@/lib/auth/validation";
import { resolveSiteUrl } from "@/lib/platform/site-url";
import { AuthenticationError, type RequestContext } from "@/services/auth/auth.service";
import type { DeliveryScheduler } from "@/services/auth/email-verification-service";
import { getEmailProvider } from "@/services/mail/email-provider";
import { accountApprovedEmail, pendingAccountOwnerEmail } from "@/services/mail/templates";
import type { EmailProvider } from "@/services/providers.contracts";

/** At most this many "new account" e-mails go to the owners per hour, so a flood of sign-ups cannot flood their inbox. */
const OWNER_NOTICES_PER_HOUR = 10;
const PENDING_LIST_LIMIT = 200;

export class AccountApprovalError extends Error {
  constructor() {
    super("This account is not waiting for approval");
    this.name = "AccountApprovalError";
  }
}

/**
 * Creates an account that cannot sign in yet. There is no session and nothing is sent to the address the applicant
 * typed, so registering with somebody else's address neither grants access nor mails that person.
 */
export async function registerPendingUser(input: RegisterData, context: RequestContext = {}) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          status: UserStatus.PENDING,
          systemRole: SystemRole.USER,
          profile: {
            create: {
              displayName: input.displayName,
              locale: input.locale,
              language: input.language,
              countryCode: input.countryCode,
              phone: input.phone,
            },
          },
        },
        include: { profile: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "user.registered",
          entityType: "User",
          entityId: user.id,
          ipAddress: context.ipAddress,
          metadata: { locale: input.locale, countryCode: input.countryCode, approval: "pending" },
        },
      });
      return user;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AuthenticationError("DUPLICATE_EMAIL");
    throw error;
  }
}

/** Tells the active owners that somebody is waiting. Best effort: it never fails the registration. */
export async function notifyOwnersOfPendingAccount(
  applicant: { displayName: string; email: string; id: string },
  options: { provider?: EmailProvider | null } = {},
) {
  const provider = options.provider === undefined ? getEmailProvider() : options.provider;
  if (!provider) return { sent: 0 };
  const sentLastHour = await db.auditLog.count({
    where: { action: "account.approval.owner_notified", createdAt: { gt: new Date(Date.now() - 3_600_000) } },
  });
  if (sentLastHour >= OWNER_NOTICES_PER_HOUR) return { sent: 0 };

  const [owners, pendingCount] = await Promise.all([
    db.user.findMany({ where: { status: UserStatus.ACTIVE, systemRole: { in: [SystemRole.SUPER_ADMIN, SystemRole.ADMIN] } }, select: { email: true } }),
    db.user.count({ where: { status: UserStatus.PENDING } }),
  ]);
  if (!owners.length) return { sent: 0 };

  const message = pendingAccountOwnerEmail({
    applicantName: applicant.displayName,
    applicantEmail: applicant.email,
    pendingCount,
    reviewUrl: `${resolveSiteUrl().origin}/admin/users`,
  });
  const traceId = randomUUID();
  const results = await Promise.allSettled(
    owners.map((owner) => provider.send({ html: message.html, subject: message.subject, text: message.text, to: owner.email, traceId: `${traceId}:${owner.email}` })),
  );
  const sent = results.filter((result) => result.status === "fulfilled").length;
  await db.auditLog.create({
    data: { action: "account.approval.owner_notified", entityType: "User", entityId: applicant.id, metadata: { provider: provider.name, owners: owners.length, sent, traceId } },
  });
  return { sent };
}

export async function listPendingAccounts() {
  const accounts = await db.user.findMany({
    where: { status: UserStatus.PENDING },
    orderBy: { createdAt: "asc" },
    take: PENDING_LIST_LIMIT,
    select: { id: true, email: true, createdAt: true, profile: { select: { displayName: true, countryCode: true, phone: true } } },
  });
  return accounts.map((account) => ({
    id: account.id,
    email: account.email,
    displayName: account.profile?.displayName ?? "",
    countryCode: account.profile?.countryCode ?? null,
    phone: account.profile?.phone ?? null,
    requestedAt: account.createdAt,
  }));
}

/**
 * Lets a waiting account in. The status changes with a conditional update, so two administrators pressing the button
 * together, or a refresh, approve it once. The applicant is told by e-mail afterwards.
 */
export async function approveAccount(
  userId: string,
  adminId: string,
  options: { provider?: EmailProvider | null; schedule?: DeliveryScheduler } = {},
) {
  const approved = await db.$transaction(async (tx) => {
    const claimed = await tx.user.updateMany({ where: { id: userId, status: UserStatus.PENDING }, data: { status: UserStatus.ACTIVE } });
    if (claimed.count !== 1) throw new AccountApprovalError();
    await tx.auditLog.create({ data: { actorId: adminId, action: "account.approved", entityType: "User", entityId: userId } });
    return tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, profile: { select: { displayName: true } } } });
  });

  const provider = options.provider === undefined ? getEmailProvider() : options.provider;
  let notified: "email" | "unavailable" = "unavailable";
  if (provider) {
    notified = "email";
    const traceId = randomUUID();
    const message = accountApprovedEmail({ name: approved.profile?.displayName ?? "", signInUrl: `${resolveSiteUrl().origin}/login` });
    const deliver = async () => {
      try {
        await provider.send({ html: message.html, subject: message.subject, text: message.text, to: approved.email, traceId });
        await db.auditLog.create({ data: { actorId: adminId, action: "account.approval.notice_delivered", entityType: "User", entityId: userId, metadata: { provider: provider.name, traceId } } });
      } catch {
        await db.auditLog.create({ data: { actorId: adminId, action: "account.approval.notice_failed", entityType: "User", entityId: userId, metadata: { provider: provider.name, traceId } } });
      }
    };
    if (options.schedule) options.schedule(() => deliver().catch(() => console.error("Account approval notice bookkeeping failed", traceId)));
    else await deliver();
  }
  return { id: userId, email: approved.email, notified };
}

/** Declines a waiting account. It becomes suspended, so it can never sign in and cannot be approved by mistake. */
export async function rejectAccount(userId: string, adminId: string) {
  return db.$transaction(async (tx) => {
    const claimed = await tx.user.updateMany({ where: { id: userId, status: UserStatus.PENDING }, data: { status: UserStatus.SUSPENDED } });
    if (claimed.count !== 1) throw new AccountApprovalError();
    await tx.auditLog.create({ data: { actorId: adminId, action: "account.rejected", entityType: "User", entityId: userId } });
    return { id: userId };
  });
}
