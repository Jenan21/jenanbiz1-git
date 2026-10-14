import { randomInt, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getDummyPasswordHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import type { RequestContext } from "@/services/auth/auth.service";
import { getEmailProvider } from "@/services/mail/email-provider";
import { verificationEmail } from "@/services/mail/templates";
import type { EmailProvider } from "@/services/providers.contracts";

export const VERIFICATION_LIFETIME_MS = 15 * 60_000;
export const VERIFICATION_MAX_ATTEMPTS = 5;
/** A new code is not mailed again within this time, so the button cannot be used to flood an inbox. */
export const VERIFICATION_RESEND_COOLDOWN_MS = 60_000;
export const VERIFICATION_MAX_CODES_PER_HOUR = 5;

export type EmailVerificationErrorCode = "ALREADY_VERIFIED" | "INVALID_OR_EXPIRED_CODE" | "TOO_MANY_CODES" | "TOO_SOON" | "ACCOUNT_UNAVAILABLE";

export class EmailVerificationError extends Error {
  constructor(
    public readonly code: EmailVerificationErrorCode,
    public readonly retryAfterSeconds = 0,
  ) {
    super(code);
    this.name = "EmailVerificationError";
  }
}

export type DeliveryScheduler = (task: () => Promise<void>) => void;

export type EmailVerificationDelivery = "email" | "development" | "unavailable";

/**
 * Mails a six-digit code to the address on the account. Only the signed-in owner of the account can ask for it, so
 * nobody can use this to send mail to an address they merely typed.
 */
export async function requestEmailVerification(
  userId: string,
  context: RequestContext = {},
  provider: EmailProvider | null = getEmailProvider(),
  schedule?: DeliveryScheduler,
) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerifiedAt: true, status: true } });
  if (!user || user.status !== "ACTIVE") throw new EmailVerificationError("ACCOUNT_UNAVAILABLE");
  if (user.emailVerifiedAt) throw new EmailVerificationError("ALREADY_VERIFIED");

  const delivery: EmailVerificationDelivery = provider ? "email" : process.env.NODE_ENV !== "production" ? "development" : "unavailable";
  if (delivery === "unavailable") return { delivery, expiresAt: null, resendAfterSeconds: 0 };

  const now = Date.now();
  const recent = await db.emailVerificationToken.findMany({
    where: { userId: user.id, createdAt: { gt: new Date(now - 3_600_000) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const latest = recent[0];
  if (latest && now - latest.createdAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS) {
    throw new EmailVerificationError("TOO_SOON", Math.ceil((VERIFICATION_RESEND_COOLDOWN_MS - (now - latest.createdAt.getTime())) / 1000));
  }
  if (recent.length >= VERIFICATION_MAX_CODES_PER_HOUR) {
    const oldestInWindow = recent[recent.length - 1]!.createdAt.getTime();
    throw new EmailVerificationError("TOO_MANY_CODES", Math.max(1, Math.ceil((oldestInWindow + 3_600_000 - now) / 1000)));
  }

  const code = String(randomInt(100_000, 1_000_000));
  const tokenHash = await hashPassword(code);
  const expiresAt = new Date(now + VERIFICATION_LIFETIME_MS);
  const token = await db.$transaction(async (transaction) => {
    await transaction.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    const created = await transaction.emailVerificationToken.create({ data: { userId: user.id, email: user.email, tokenHash, expiresAt } });
    await transaction.auditLog.create({
      data: { actorId: user.id, action: "authentication.email_verification.requested", entityType: "EmailVerificationToken", entityId: created.id, ipAddress: context.ipAddress },
    });
    return created;
  });

  if (!provider) return { delivery, developmentCode: code, expiresAt, resendAfterSeconds: VERIFICATION_RESEND_COOLDOWN_MS / 1000 };

  const traceId = randomUUID();
  const deliver = async () => {
    try {
      const message = verificationEmail({ code, expiresInMinutes: VERIFICATION_LIFETIME_MS / 60_000 });
      await provider.send({ html: message.html, subject: message.subject, text: message.text, to: user.email, traceId });
      await db.auditLog.create({
        data: { actorId: user.id, action: "authentication.email_verification.delivered", entityType: "EmailVerificationToken", entityId: token.id, ipAddress: context.ipAddress, metadata: { provider: provider.name, traceId } },
      });
    } catch {
      // A code that never arrived must not count against the person: close it and let them ask again.
      await db.$transaction([
        db.emailVerificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
        db.auditLog.create({
          data: { actorId: user.id, action: "authentication.email_verification.delivery_failed", entityType: "EmailVerificationToken", entityId: token.id, ipAddress: context.ipAddress, metadata: { provider: provider.name, traceId } },
        }),
      ]);
    }
  };
  if (schedule) schedule(() => deliver().catch(() => console.error("E-mail verification delivery bookkeeping failed", traceId)));
  else await deliver();
  return { delivery, expiresAt, resendAfterSeconds: VERIFICATION_RESEND_COOLDOWN_MS / 1000 };
}

/** Checks the code the person typed. Five wrong guesses close the code, however many arrive at once. */
export async function confirmEmailVerification(userId: string, code: string, context: RequestContext = {}) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      status: true,
      emailVerificationTokens: { where: { usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!user || user.status !== "ACTIVE") throw new EmailVerificationError("ACCOUNT_UNAVAILABLE");
  if (user.emailVerifiedAt) return { verified: true as const, alreadyVerified: true };

  const token = user.emailVerificationTokens[0];
  // A code is only good for the address it was sent to.
  if (!token || token.email !== user.email) {
    await verifyPassword(await getDummyPasswordHash(), code);
    throw new EmailVerificationError("INVALID_OR_EXPIRED_CODE");
  }
  const reserved = await db.emailVerificationToken.updateMany({
    where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: VERIFICATION_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count !== 1) {
    await verifyPassword(await getDummyPasswordHash(), code);
    throw new EmailVerificationError("INVALID_OR_EXPIRED_CODE");
  }
  if (!(await verifyPassword(token.tokenHash, code))) throw new EmailVerificationError("INVALID_OR_EXPIRED_CODE");

  await db.$transaction(async (transaction) => {
    const claimed = await transaction.emailVerificationToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new EmailVerificationError("INVALID_OR_EXPIRED_CODE");
    // Only the address the code was sent to can be marked verified, even if the account's address changed meanwhile.
    const marked = await transaction.user.updateMany({ where: { id: user.id, email: token.email, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
    if (marked.count !== 1) throw new EmailVerificationError("INVALID_OR_EXPIRED_CODE");
    await transaction.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    await transaction.auditLog.create({
      data: { actorId: user.id, action: "authentication.email_verification.completed", entityType: "User", entityId: user.id, ipAddress: context.ipAddress },
    });
  });
  return { verified: true as const, alreadyVerified: false };
}

export async function getEmailVerificationStatus(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
  return { verified: Boolean(user?.emailVerifiedAt), verifiedAt: user?.emailVerifiedAt ?? null };
}
