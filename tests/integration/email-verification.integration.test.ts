import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import {
  confirmEmailVerification,
  EmailVerificationError,
  getEmailVerificationStatus,
  requestEmailVerification,
  VERIFICATION_MAX_ATTEMPTS,
} from "@/services/auth/email-verification-service";
import type { EmailProvider } from "@/services/providers.contracts";

const suffix = crypto.randomUUID().slice(0, 8);
const userIds: string[] = [];

async function makeUser(label: string, verified = false) {
  const user = await db.user.create({
    data: { email: `verify-${label}-${suffix}@example.test`, status: "ACTIVE", emailVerifiedAt: verified ? new Date() : null },
  });
  userIds.push(user.id);
  return user;
}

function mailbox() {
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const provider: EmailProvider = {
    name: "test",
    send: vi.fn(async (input) => {
      sent.push({ to: input.to, subject: input.subject, text: input.text });
      return { messageId: `m-${sent.length}` };
    }),
  };
  const codeFor = (index = sent.length - 1) => /\b(\d{6})\b/.exec(sent[index]!.text)![1]!;
  return { provider, sent, codeFor };
}

const expectCode = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(EmailVerificationError);
  expect((error as EmailVerificationError).code).toBe(code);
  return error as EmailVerificationError;
};

beforeAll(async () => {
  await db.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  if (userIds.length) await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("email verification", () => {
  it("mails a six-digit code to the account's own address and verifies it", async () => {
    const user = await makeUser("happy");
    const { provider, sent, codeFor } = mailbox();
    const result = await requestEmailVerification(user.id, {}, provider);
    expect(result).toMatchObject({ delivery: "email", resendAfterSeconds: 60 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(user.email);
    expect(codeFor()).toMatch(/^\d{6}$/);
    expect(result).not.toHaveProperty("developmentCode");

    const stored = await db.emailVerificationToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toContain(codeFor());
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);

    expect(await confirmEmailVerification(user.id, codeFor())).toEqual({ verified: true, alreadyVerified: false });
    expect(await getEmailVerificationStatus(user.id)).toMatchObject({ verified: true });
    expect(await confirmEmailVerification(user.id, "000000")).toEqual({ verified: true, alreadyVerified: true });
    await expectCode(requestEmailVerification(user.id, {}, provider), "ALREADY_VERIFIED");
  });

  it("rejects a wrong code and closes the code after five guesses, even for the right one", async () => {
    const user = await makeUser("guess");
    const { provider, codeFor } = mailbox();
    await requestEmailVerification(user.id, {}, provider);
    const right = codeFor();
    const wrong = right === "111111" ? "222222" : "111111";
    for (let attempt = 0; attempt < VERIFICATION_MAX_ATTEMPTS; attempt += 1) {
      await expectCode(confirmEmailVerification(user.id, wrong), "INVALID_OR_EXPIRED_CODE");
    }
    await expectCode(confirmEmailVerification(user.id, right), "INVALID_OR_EXPIRED_CODE");
    expect((await getEmailVerificationStatus(user.id)).verified).toBe(false);
  });

  it("counts parallel guesses against the same cap", async () => {
    const user = await makeUser("parallel");
    const { provider, codeFor } = mailbox();
    await requestEmailVerification(user.id, {}, provider);
    const right = codeFor();
    const wrong = right === "333333" ? "444444" : "333333";
    await Promise.allSettled(Array.from({ length: 12 }, () => confirmEmailVerification(user.id, wrong)));
    const token = await db.emailVerificationToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(token.attempts).toBe(VERIFICATION_MAX_ATTEMPTS);
    await expectCode(confirmEmailVerification(user.id, right), "INVALID_OR_EXPIRED_CODE");
  });

  it("does not accept an expired code", async () => {
    const user = await makeUser("expired");
    const { provider, codeFor } = mailbox();
    await requestEmailVerification(user.id, {}, provider);
    await db.emailVerificationToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expectCode(confirmEmailVerification(user.id, codeFor()), "INVALID_OR_EXPIRED_CODE");
  });

  it("does not verify a new address with a code that was sent to the old one", async () => {
    const user = await makeUser("moved");
    const { provider, codeFor } = mailbox();
    await requestEmailVerification(user.id, {}, provider);
    const code = codeFor();
    await db.user.update({ where: { id: user.id }, data: { email: `verify-moved-new-${suffix}@example.test` } });
    await expectCode(confirmEmailVerification(user.id, code), "INVALID_OR_EXPIRED_CODE");
    expect((await getEmailVerificationStatus(user.id)).verified).toBe(false);
  });

  it("makes people wait a minute between codes and allows five an hour", async () => {
    const user = await makeUser("limits");
    const { provider, sent } = mailbox();
    await requestEmailVerification(user.id, {}, provider);
    const soon = await expectCode(requestEmailVerification(user.id, {}, provider), "TOO_SOON");
    expect(soon.retryAfterSeconds).toBeGreaterThan(0);
    expect(soon.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(sent).toHaveLength(1);

    for (let index = 0; index < 4; index += 1) {
      await db.emailVerificationToken.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 120_000 - index) } });
      await requestEmailVerification(user.id, {}, provider);
    }
    await db.emailVerificationToken.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
    const capped = await expectCode(requestEmailVerification(user.id, {}, provider), "TOO_MANY_CODES");
    expect(capped.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("replaces the previous code when a new one is requested", async () => {
    const user = await makeUser("replace");
    const { provider, codeFor } = mailbox();
    await requestEmailVerification(user.id, {}, provider);
    const first = codeFor(0);
    await db.emailVerificationToken.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
    await requestEmailVerification(user.id, {}, provider);
    if (codeFor(1) !== first) await expectCode(confirmEmailVerification(user.id, first), "INVALID_OR_EXPIRED_CODE");
    expect(await confirmEmailVerification(user.id, codeFor(1))).toMatchObject({ verified: true });
  });

  it("closes a code that never arrived so it does not count against the person", async () => {
    const user = await makeUser("failed");
    const failing: EmailProvider = { name: "failing", send: vi.fn().mockRejectedValue(new Error("down")) };
    await requestEmailVerification(user.id, {}, failing);
    const token = await db.emailVerificationToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(token.usedAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { actorId: user.id, action: "authentication.email_verification.delivery_failed" } })).toBe(1);
  });

  it("hands delivery to the scheduler when one is given", async () => {
    const user = await makeUser("scheduled");
    const { provider, sent } = mailbox();
    const tasks: Array<() => Promise<void>> = [];
    await requestEmailVerification(user.id, {}, provider, (task) => tasks.push(task));
    expect(sent).toHaveLength(0);
    await tasks[0]!();
    expect(sent).toHaveLength(1);
  });

  it("shows a code on screen only outside production when mail is not configured", async () => {
    const user = await makeUser("dev");
    const development = await requestEmailVerification(user.id, {}, null);
    expect(development.delivery).toBe("development");
    expect((development as { developmentCode?: string }).developmentCode).toMatch(/^\d{6}$/);

    vi.stubEnv("NODE_ENV", "production");
    try {
      const other = await makeUser("prod");
      const production = await requestEmailVerification(other.id, {}, null);
      expect(production.delivery).toBe("unavailable");
      expect(production).not.toHaveProperty("developmentCode");
      expect(await db.emailVerificationToken.count({ where: { userId: other.id } })).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses a suspended account", async () => {
    const user = await makeUser("suspended");
    await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    await expectCode(requestEmailVerification(user.id, {}, mailbox().provider), "ACCOUNT_UNAVAILABLE");
    await expectCode(confirmEmailVerification(user.id, "123456"), "ACCOUNT_UNAVAILABLE");
  });
});
