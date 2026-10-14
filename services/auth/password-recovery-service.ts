import { randomInt, randomUUID } from "node:crypto";
import { UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getDummyPasswordHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { getPasswordRecoveryEmailProvider } from "@/services/auth/recovery-email-provider";
import { recoveryEmail } from "@/services/mail/templates";
import type { RequestContext } from "@/services/auth/auth.service";
import type { EmailProvider } from "@/services/providers.contracts";

const resetLifetimeMs = 10 * 60 * 1000;
const maxAttempts = 5;

export class PasswordRecoveryError extends Error {
  constructor(public code: "INVALID_OR_EXPIRED_CODE") {
    super(code);
  }
}

/**
 * `schedule` lets the caller run the e-mail delivery after the response has been sent. Delivery takes a visible amount
 * of time for real accounts and none for unknown ones, so awaiting it would reveal which addresses are registered.
 * Without a scheduler (tests, scripts) delivery runs inline.
 */
export type DeliveryScheduler = (task: () => Promise<void>) => void;

export async function requestPasswordReset(
  email: string,
  context: RequestContext = {},
  provider: EmailProvider | null = getPasswordRecoveryEmailProvider(),
  schedule?: DeliveryScheduler,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, status: true },
  });
  const developmentDelivery =
    !provider && process.env.NODE_ENV !== "production";
  const delivery = provider
    ? ("email" as const)
    : developmentDelivery
      ? ("development" as const)
      : ("unavailable" as const);

  if (
    !user ||
    user.status !== UserStatus.ACTIVE ||
    delivery === "unavailable"
  ) {
    // Spend the time a real request spends on hashing the code, so this answer is not faster than the others.
    await hashPassword(String(randomInt(100_000, 1_000_000)));
    return { accepted: true, delivery };
  }

  const code = String(randomInt(100_000, 1_000_000));
  const tokenHash = await hashPassword(code);
  const expiresAt = new Date(Date.now() + resetLifetimeMs);

  const token = await db.$transaction(async (transaction) => {
    await transaction.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = await transaction.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });
    await transaction.auditLog.create({
      data: {
        actorId: user.id,
        action: "authentication.password_reset.requested",
        entityType: "PasswordResetToken",
        entityId: token.id,
        ipAddress: context.ipAddress,
      },
    });
    return token;
  });

  if (provider) {
    const traceId = randomUUID();
    const deliver = async () => {
      try {
        const message = recoveryEmail({ code, expiresInMinutes: resetLifetimeMs / 60_000 });
        await provider.send({
          html: message.html,
          subject: message.subject,
          text: message.text,
          to: normalizedEmail,
          traceId,
        });
        await db.auditLog.create({
          data: {
            actorId: user.id,
            action: "authentication.password_reset.delivered",
            entityType: "PasswordResetToken",
            entityId: token.id,
            ipAddress: context.ipAddress,
            metadata: { provider: provider.name, traceId },
          },
        });
      } catch {
        await db.$transaction([
          db.passwordResetToken.update({
            where: { id: token.id },
            data: { usedAt: new Date() },
          }),
          db.auditLog.create({
            data: {
              actorId: user.id,
              action: "authentication.password_reset.delivery_failed",
              entityType: "PasswordResetToken",
              entityId: token.id,
              ipAddress: context.ipAddress,
              metadata: { provider: provider.name, traceId },
            },
          }),
        ]);
      }
    };
    if (schedule) {
      schedule(() =>
        deliver().catch(() => {
          console.error("Password recovery delivery bookkeeping failed", traceId);
        }),
      );
    } else {
      await deliver();
    }
    return { accepted: true, delivery: "email" as const };
  }

  return {
    accepted: true,
    delivery: "development" as const,
    developmentCode: code,
    expiresAt,
  };
}

export async function confirmPasswordReset(
  input: { code: string; email: string; password: string },
  context: RequestContext = {},
) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      status: true,
      passwordResetTokens: {
        where: { usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  const token = user?.passwordResetTokens[0];
  if (!user || user.status !== UserStatus.ACTIVE || !token) {
    // No live code for this address: verify against a hash nobody knows so the answer takes as long as a wrong guess.
    await verifyPassword(await getDummyPasswordHash(), input.code);
    throw new PasswordRecoveryError("INVALID_OR_EXPIRED_CODE");
  }

  // Take one of the code's attempts before checking it. The update only matches while the code is live and under the
  // cap, so concurrent guesses cannot exceed `maxAttempts` in total, however many arrive at once.
  const reserved = await db.passwordResetToken.updateMany({
    where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: maxAttempts } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count !== 1) {
    await verifyPassword(await getDummyPasswordHash(), input.code);
    throw new PasswordRecoveryError("INVALID_OR_EXPIRED_CODE");
  }

  const valid = await verifyPassword(token.tokenHash, input.code);
  if (!valid) throw new PasswordRecoveryError("INVALID_OR_EXPIRED_CODE");

  const passwordHash = await hashPassword(input.password);
  await db.$transaction(async (transaction) => {
    const claimed = await transaction.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new PasswordRecoveryError("INVALID_OR_EXPIRED_CODE");
    await transaction.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await transaction.session.deleteMany({ where: { userId: user.id } });
    await transaction.auditLog.create({
      data: {
        actorId: user.id,
        action: "authentication.password_reset.completed",
        entityType: "User",
        entityId: user.id,
        ipAddress: context.ipAddress,
      },
    });
  });
}
