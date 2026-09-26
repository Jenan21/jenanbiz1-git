import { randomInt } from "node:crypto";
import { UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { RequestContext } from "@/services/auth/auth.service";

const resetLifetimeMs = 10 * 60 * 1000;
const maxAttempts = 5;

export class PasswordRecoveryError extends Error {
  constructor(public code: "INVALID_OR_EXPIRED_CODE" | "ACCOUNT_DISABLED") {
    super(code);
  }
}

export async function requestPasswordReset(email: string, context: RequestContext = {}) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, status: true } });
  const developmentDelivery = process.env.NODE_ENV !== "production";

  if (!user || user.status !== UserStatus.ACTIVE || !developmentDelivery) {
    return { accepted: true, delivery: developmentDelivery ? "development" as const : "unavailable" as const };
  }

  const code = String(randomInt(100_000, 1_000_000));
  const tokenHash = await hashPassword(code);
  const expiresAt = new Date(Date.now() + resetLifetimeMs);

  await db.$transaction(async (transaction) => {
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
  });

  return { accepted: true, delivery: "development" as const, developmentCode: code, expiresAt };
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
  if (!user || user.status !== UserStatus.ACTIVE || !token || token.attempts >= maxAttempts) {
    throw new PasswordRecoveryError(user && user.status !== UserStatus.ACTIVE ? "ACCOUNT_DISABLED" : "INVALID_OR_EXPIRED_CODE");
  }

  const valid = await verifyPassword(token.tokenHash, input.code);
  if (!valid) {
    await db.passwordResetToken.update({
      where: { id: token.id },
      data: {
        attempts: { increment: 1 },
        usedAt: token.attempts + 1 >= maxAttempts ? new Date() : undefined,
      },
    });
    throw new PasswordRecoveryError("INVALID_OR_EXPIRED_CODE");
  }

  const passwordHash = await hashPassword(input.password);
  await db.$transaction(async (transaction) => {
    const claimed = await transaction.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new PasswordRecoveryError("INVALID_OR_EXPIRED_CODE");
    await transaction.user.update({ where: { id: user.id }, data: { passwordHash } });
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