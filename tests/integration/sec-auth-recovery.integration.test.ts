import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { loginUser, registerUser } from "@/services/auth/auth.service";
import { confirmPasswordReset, requestPasswordReset } from "@/services/auth/password-recovery-service";
import type { EmailProvider } from "@/services/providers.contracts";

const EMAIL = "sec.auth.recovery@example.test";
const registration = {
  displayName: "Security Recovery",
  email: EMAIL,
  password: "Correct-Horse-2026!",
  locale: "en" as const,
  language: "en" as const,
  countryCode: "SA",
};

async function clean() {
  const users = await db.user.findMany({ where: { email: EMAIL }, select: { id: true } });
  const ids = users.map(({ id }) => id);
  if (!ids.length) return;
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityType: "User", entityId: { in: ids } }] } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

describe.sequential("password recovery hardening", () => {
  beforeEach(clean);
  afterAll(async () => {
    await clean();
    await db.$disconnect();
  });

  it("allows at most five guesses per code even when they arrive at the same moment", async () => {
    const registered = await registerUser(registration);
    const requested = await requestPasswordReset(EMAIL);
    const code = requested.developmentCode;
    if (!code) throw new Error("Development reset code was not returned");
    const wrong = code === "000000" ? "111111" : "000000";

    const guesses = await Promise.allSettled(
      Array.from({ length: 14 }, () => confirmPasswordReset({ email: EMAIL, code: wrong, password: "Replacement-Password-2026!" })),
    );
    expect(guesses.every((guess) => guess.status === "rejected")).toBe(true);

    const token = await db.passwordResetToken.findFirstOrThrow({ where: { userId: registered.user.id } });
    expect(token.attempts).toBe(5);

    // the budget is spent: even the correct code is refused now and the password is unchanged
    await expect(confirmPasswordReset({ email: EMAIL, code, password: "Replacement-Password-2026!" })).rejects.toMatchObject({
      code: "INVALID_OR_EXPIRED_CODE",
    });
    await expect(loginUser({ email: EMAIL, password: registration.password, remember: false })).resolves.toMatchObject({
      user: { id: registered.user.id },
    });
  });

  it("still accepts the correct code within the attempt budget", async () => {
    await registerUser(registration);
    const code = (await requestPasswordReset(EMAIL)).developmentCode;
    if (!code) throw new Error("Development reset code was not returned");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i += 1) {
      await expect(confirmPasswordReset({ email: EMAIL, code: wrong, password: "Replacement-Password-2026!" })).rejects.toBeTruthy();
    }
    await expect(confirmPasswordReset({ email: EMAIL, code, password: "Replacement-Password-2026!" })).resolves.toBeUndefined();
  });

  it("does not make an unknown address answer faster than a registered one", async () => {
    await registerUser(registration);
    const timed = async (email: string) => {
      const start = performance.now();
      await requestPasswordReset(email);
      return performance.now() - start;
    };
    await timed(EMAIL); // warm the hashing code
    const known: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      known.push(await timed(EMAIL));
      unknown.push(await timed(`nobody.${i}@example.test`));
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    // both paths hash a code: the unknown one must take at least half as long as the real one
    expect(median(unknown)).toBeGreaterThan(median(known) * 0.5);
  });

  it("runs the e-mail delivery through the scheduler instead of inside the request", async () => {
    await registerUser(registration);
    let sent = 0;
    const provider: EmailProvider = {
      name: "test",
      async send() {
        sent += 1;
        await new Promise((resolve) => setTimeout(resolve, 150));
        return { messageId: "test-message" };
      },
    };
    let deferred: (() => Promise<void>) | null = null;
    const started = performance.now();
    const result = await requestPasswordReset(EMAIL, {}, provider, (task) => {
      deferred = task;
    });
    const elapsed = performance.now() - started;

    expect(result).toEqual({ accepted: true, delivery: "email" });
    expect(sent).toBe(0); // nothing was sent while the response was being produced
    expect(deferred).not.toBeNull();
    await (deferred as unknown as () => Promise<void>)();
    expect(sent).toBe(1);
    expect(elapsed).toBeLessThan(5_000);
    const delivered = await db.auditLog.count({ where: { action: "authentication.password_reset.delivered" } });
    expect(delivered).toBeGreaterThanOrEqual(1);
  });
});
