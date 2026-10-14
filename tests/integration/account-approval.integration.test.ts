import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AuthenticationError, loginUser, getSessionUser } from "@/services/auth/auth.service";
import {
  AccountApprovalError,
  approveAccount,
  listPendingAccounts,
  notifyOwnersOfPendingAccount,
  registerPendingUser,
  rejectAccount,
} from "@/services/auth/account-approval-service";
import { signInWithOAuthProfile, OAuthSignInError } from "@/services/auth/oauth-service";
import { hashSessionToken } from "@/lib/auth/token";
import type { EmailProvider } from "@/services/providers.contracts";

const suffix = crypto.randomUUID().slice(0, 8);
const password = "Correct-horse-battery-12";
const emails = { applicant: `approval-applicant-${suffix}@example.test`, second: `approval-second-${suffix}@example.test`, owner: `approval-owner-${suffix}@example.test`, oauth: `approval-oauth-${suffix}@example.test` };
const ids: string[] = [];
let adminId = "";

const registration = (email: string, displayName: string) => ({ displayName, email, password, locale: "en" as const, language: "en" as const, countryCode: "SA" });

function mailbox() {
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const provider: EmailProvider = {
    name: "test",
    send: vi.fn(async (input) => {
      sent.push({ to: input.to, subject: input.subject, text: input.text });
      return { messageId: `m-${sent.length}` };
    }),
  };
  return { provider, sent };
}

const expectAuthCode = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(AuthenticationError);
  expect((error as AuthenticationError).code).toBe(code);
};

beforeAll(async () => {
  const owner = await db.user.create({ data: { email: emails.owner, status: "ACTIVE", systemRole: "ADMIN", emailVerifiedAt: new Date() } });
  adminId = owner.id;
  ids.push(owner.id);
});

afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { contains: `-${suffix}@example.test` } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: userIds } }] } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("account approval", () => {
  it("creates a waiting account that has no session and cannot sign in", async () => {
    const applicant = await registerPendingUser(registration(emails.applicant, "Waiting Person"), { ipAddress: "203.0.113.9" });
    ids.push(applicant.id);
    expect(applicant.status).toBe(UserStatus.PENDING);
    expect(applicant.emailVerifiedAt).toBeNull();
    expect(await db.session.count({ where: { userId: applicant.id } })).toBe(0);
    expect(await db.auditLog.findFirst({ where: { actorId: applicant.id, action: "user.registered" } })).toMatchObject({ metadata: { approval: "pending" } });

    await expectAuthCode(loginUser({ email: emails.applicant, password, remember: false }), "PENDING_APPROVAL");
    expect(await db.session.count({ where: { userId: applicant.id } })).toBe(0);
  });

  it("tells only the person who knows the password that the account is waiting", async () => {
    await expectAuthCode(loginUser({ email: emails.applicant, password: "Wrong-password-999999", remember: false }), "INVALID_CREDENTIALS");
    await expectAuthCode(loginUser({ email: `nobody-${suffix}@example.test`, password, remember: false }), "INVALID_CREDENTIALS");
  });

  it("refuses a second registration with the same address", async () => {
    await expectAuthCode(registerPendingUser(registration(emails.applicant, "Someone Else")), "DUPLICATE_EMAIL");
  });

  it("lists waiting accounts with what the applicant typed", async () => {
    const pending = await listPendingAccounts();
    const entry = pending.find((item) => item.email === emails.applicant);
    expect(entry).toMatchObject({ displayName: "Waiting Person", countryCode: "SA" });
    expect(JSON.stringify(entry)).not.toMatch(/passwordHash|argon2/);
  });

  it("tells the owners about a new request, not the applicant, and caps the number of notices", async () => {
    const { provider, sent } = mailbox();
    const applicant = await db.user.findUniqueOrThrow({ where: { email: emails.applicant } });
    const result = await notifyOwnersOfPendingAccount({ id: applicant.id, email: applicant.email, displayName: "Waiting Person" }, { provider });
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(sent.some((message) => message.to === emails.owner)).toBe(true);
    expect(sent.every((message) => message.to !== emails.applicant)).toBe(true);
    const mail = sent.find((message) => message.to === emails.owner)!;
    expect(mail.text).toContain(emails.applicant);
    expect(mail.text).toContain("/admin/users");

    expect(await notifyOwnersOfPendingAccount({ id: applicant.id, email: applicant.email, displayName: "Waiting Person" }, { provider: null })).toEqual({ sent: 0 });
  });

  it("approves once, mails the applicant, and then lets them sign in", async () => {
    const { provider, sent } = mailbox();
    const applicant = await db.user.findUniqueOrThrow({ where: { email: emails.applicant } });
    const approved = await approveAccount(applicant.id, adminId, { provider });
    expect(approved).toMatchObject({ id: applicant.id, email: emails.applicant, notified: "email" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: emails.applicant });
    expect(sent[0].text).toContain("/login");
    expect(await db.auditLog.count({ where: { actorId: adminId, action: "account.approved", entityId: applicant.id } })).toBe(1);

    const session = await loginUser({ email: emails.applicant, password, remember: false }, { ipAddress: "203.0.113.9" });
    expect(session.user.id).toBe(applicant.id);
    expect(await getSessionUser(session.token)).not.toBeNull();
    expect((await db.session.findFirstOrThrow({ where: { userId: applicant.id } })).tokenHash).toBe(hashSessionToken(session.token));

    await expect(approveAccount(applicant.id, adminId, { provider })).rejects.toBeInstanceOf(AccountApprovalError);
    expect(sent).toHaveLength(1);
  });

  it("approves only one of two simultaneous requests", async () => {
    const waiting = await registerPendingUser(registration(`approval-race-${suffix}@example.test`, "Race Person"));
    const { provider, sent } = mailbox();
    const results = await Promise.allSettled([approveAccount(waiting.id, adminId, { provider }), approveAccount(waiting.id, adminId, { provider })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("hands the notice to the scheduler and survives a provider failure", async () => {
    const waiting = await registerPendingUser(registration(`approval-sched-${suffix}@example.test`, "Scheduled Person"));
    const tasks: Array<() => Promise<void>> = [];
    const failing: EmailProvider = { name: "failing", send: vi.fn().mockRejectedValue(new Error("down")) };
    const result = await approveAccount(waiting.id, adminId, { provider: failing, schedule: (task) => tasks.push(task) });
    expect(result.notified).toBe("email");
    expect(failing.send).not.toHaveBeenCalled();
    await tasks[0]!();
    expect(failing.send).toHaveBeenCalledTimes(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe(UserStatus.ACTIVE);
    expect(await db.auditLog.count({ where: { action: "account.approval.notice_failed", entityId: waiting.id } })).toBe(1);
  });

  it("declines an application: it can never sign in or be approved afterwards", async () => {
    const declined = await registerPendingUser(registration(emails.second, "Declined Person"));
    expect(await rejectAccount(declined.id, adminId)).toEqual({ id: declined.id });
    expect((await db.user.findUniqueOrThrow({ where: { id: declined.id } })).status).toBe(UserStatus.SUSPENDED);
    await expectAuthCode(loginUser({ email: emails.second, password, remember: false }), "ACCOUNT_DISABLED");
    await expect(approveAccount(declined.id, adminId, { provider: null })).rejects.toBeInstanceOf(AccountApprovalError);
    await expect(rejectAccount(declined.id, adminId)).rejects.toBeInstanceOf(AccountApprovalError);
  });

  it("does not approve an account that is already active", async () => {
    await expect(approveAccount(adminId, adminId, { provider: null })).rejects.toBeInstanceOf(AccountApprovalError);
  });

  it("makes a new Google or Apple account wait too, without a session", async () => {
    const options = { locale: "en" as const, countryCode: "SA", registrationOpen: true, approvalRequired: true };
    const profile = { provider: "google" as const, subject: `approval-subject-${suffix}`, email: emails.oauth, emailVerified: true, name: "Oauth Person" };
    await expect(signInWithOAuthProfile(profile, options)).rejects.toMatchObject({ code: "PENDING_APPROVAL" });
    const created = await db.user.findUniqueOrThrow({ where: { email: emails.oauth } });
    expect(created.status).toBe(UserStatus.PENDING);
    expect(await db.session.count({ where: { userId: created.id } })).toBe(0);

    const again = await signInWithOAuthProfile(profile, options).then(() => null, (error: unknown) => error);
    expect(again).toBeInstanceOf(OAuthSignInError);
    expect((again as OAuthSignInError).code).toBe("PENDING_APPROVAL");

    await approveAccount(created.id, adminId, { provider: null });
    const signedIn = await signInWithOAuthProfile(profile, options);
    expect(signedIn.created).toBe(false);
    expect(await db.session.count({ where: { userId: created.id } })).toBe(1);
  });

  it("keeps creating active accounts when approval is not required", async () => {
    const profile = { provider: "google" as const, subject: `approval-open-${suffix}`, email: `approval-open-${suffix}@example.test`, emailVerified: true, name: "Open Person" };
    const result = await signInWithOAuthProfile(profile, { locale: "en", countryCode: "SA", registrationOpen: true });
    expect(result.created).toBe(true);
  });
});
