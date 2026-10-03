import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SystemRole, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashSessionToken } from "@/lib/auth/token";
import {
  DEFAULT_SESSION_SECONDS,
  REMEMBERED_SESSION_SECONDS,
} from "@/lib/auth/token";
import { registerSchema } from "@/lib/auth/validation";
import { hasPermission } from "@/lib/auth/authorization";
import {
  canAccessAdmin,
  getSessionUser,
  loginUser,
  logoutSession,
  registerUser,
} from "@/services/auth/auth.service";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "@/services/auth/password-recovery-service";
import { completeOnboarding } from "@/services/account/onboarding-service";

const baseRegistration = {
  displayName: "Integration User",
  email: "integration.user@example.test",
  password: "Correct-Horse-2026!",
  locale: "en" as const,
  language: "en" as const,
  countryCode: "SA",
  phone: "+966501234567",
};

async function cleanIdentityData() {
  const users = await db.user.findMany({
    where: { email: baseRegistration.email },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  if (userIds.length) {
    await db.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: userIds } },
          { entityType: "User", entityId: { in: userIds } },
        ],
      },
    });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await db.organization.deleteMany({
    where: { slug: { startsWith: "integration-" } },
  });
  await db.permission.deleteMany({
    where: { key: "organization.manage" },
  });
}

describe.sequential("real PostgreSQL authentication integration", () => {
  beforeEach(cleanIdentityData);
  afterAll(async () => {
    await cleanIdentityData();
    await db.$disconnect();
  });

  it("registers a real user, profile, session, and audit event", async () => {
    const result = await registerUser(baseRegistration);
    const stored = await db.user.findUnique({
      where: { id: result.user.id },
      include: { profile: true, sessions: true },
    });
    expect(stored).toMatchObject({
      email: baseRegistration.email,
      systemRole: SystemRole.USER,
      profile: {
        locale: "en",
        language: "en",
        countryCode: "SA",
        phone: baseRegistration.phone,
      },
    });
    expect(stored?.sessions).toHaveLength(1);
    expect(stored?.sessions[0]?.tokenHash).not.toBe(result.token);
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(
      await db.auditLog.count({
        where: { action: "user.registered", actorId: result.user.id },
      }),
    ).toBe(1);
  });

  it("rejects a duplicate email", async () => {
    await registerUser(baseRegistration);
    await expect(
      registerUser({ ...baseRegistration, displayName: "Duplicate" }),
    ).rejects.toMatchObject({
      code: "DUPLICATE_EMAIL",
    });
  });

  it("completes account onboarding with persisted preferences and audit evidence", async () => {
    const registered = await registerUser(baseRegistration);
    const profile = await completeOnboarding(
      {
        accountType: "ORGANIZATION",
        city: "Riyadh",
        countryCode: "SA",
        interests: ["PROJECTS", "MARKET", "SOFTWARE"],
      },
      registered.user.id,
    );
    expect(profile).toMatchObject({
      accountType: "ORGANIZATION",
      city: "Riyadh",
      countryCode: "SA",
    });
    expect(profile.interests).toEqual(["PROJECTS", "MARKET", "SOFTWARE"]);
    expect(profile.onboardedAt).toBeInstanceOf(Date);
    expect(
      await db.auditLog.count({
        where: {
          actorId: registered.user.id,
          action: "user.onboarding.completed",
        },
      }),
    ).toBe(1);
  });

  it("resets a password with a single-use code and invalidates existing sessions", async () => {
    const registered = await registerUser(baseRegistration);
    const requested = await requestPasswordReset(baseRegistration.email);
    expect(requested.delivery).toBe("development");
    expect(requested.developmentCode).toMatch(/^\d{6}$/);
    const code = requested.developmentCode;
    if (!code) throw new Error("Development reset code was not returned");

    await expect(
      confirmPasswordReset({
        email: baseRegistration.email,
        code: "000000",
        password: "Replacement-Password-2026!",
      }),
    ).rejects.toMatchObject({ code: "INVALID_OR_EXPIRED_CODE" });
    await confirmPasswordReset({
      email: baseRegistration.email,
      code,
      password: "Replacement-Password-2026!",
    });
    expect(
      await db.session.count({ where: { userId: registered.user.id } }),
    ).toBe(0);
    await expect(
      loginUser({
        email: baseRegistration.email,
        password: baseRegistration.password,
        remember: false,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(
      loginUser({
        email: baseRegistration.email,
        password: "Replacement-Password-2026!",
        remember: false,
      }),
    ).resolves.toMatchObject({ user: { id: registered.user.id } });
    expect(
      await db.auditLog.count({
        where: {
          actorId: registered.user.id,
          action: "authentication.password_reset.completed",
        },
      }),
    ).toBe(1);
  });

  it("delivers a recovery code through a configured provider without returning it", async () => {
    const registered = await registerUser(baseRegistration);
    let deliveredText = "";
    const requested = await requestPasswordReset(
      baseRegistration.email,
      {},
      {
        name: "integration-email",
        async send(input) {
          deliveredText = input.text;
          return { messageId: "integration-message" };
        },
      },
    );
    expect(requested.delivery).toBe("email");
    expect("developmentCode" in requested).toBe(false);
    const code = deliveredText.match(/\b\d{6}\b/)?.[0];
    expect(code).toMatch(/^\d{6}$/);
    await confirmPasswordReset({
      email: baseRegistration.email,
      code: code!,
      password: "Delivered-Password-2026!",
    });
    expect(
      await db.auditLog.count({
        where: {
          actorId: registered.user.id,
          action: "authentication.password_reset.delivered",
        },
      }),
    ).toBe(1);
  });

  it("keeps provider failures neutral and invalidates the undelivered code", async () => {
    const registered = await registerUser(baseRegistration);
    const requested = await requestPasswordReset(
      baseRegistration.email,
      {},
      {
        name: "failing-email",
        async send() {
          throw new Error("Provider unavailable");
        },
      },
    );
    expect(requested).toEqual({ accepted: true, delivery: "email" });
    expect(
      await db.passwordResetToken.count({
        where: { userId: registered.user.id, usedAt: null },
      }),
    ).toBe(0);
    expect(
      await db.auditLog.count({
        where: {
          actorId: registered.user.id,
          action: "authentication.password_reset.delivery_failed",
        },
      }),
    ).toBe(1);
  });

  it("keeps recovery responses neutral for an unknown email", async () => {
    let deliveries = 0;
    const requested = await requestPasswordReset(
      "missing.account@example.test",
      {},
      {
        name: "integration-email",
        async send() {
          deliveries += 1;
          return { messageId: "unexpected" };
        },
      },
    );
    expect(requested).toEqual({ accepted: true, delivery: "email" });
    expect(deliveries).toBe(0);
  });

  it("rejects invalid registration input before database access", () => {
    expect(
      registerSchema.safeParse({
        ...baseRegistration,
        password: "short",
        countryCode: "Saudi Arabia",
      }).success,
    ).toBe(false);
  });

  it("logs in with the correct password and creates a new session", async () => {
    const registered = await registerUser(baseRegistration);
    const loggedIn = await loginUser({
      email: baseRegistration.email,
      password: baseRegistration.password,
      remember: false,
    });
    expect(loggedIn.user.id).toBe(registered.user.id);
    expect(
      await db.session.count({ where: { userId: registered.user.id } }),
    ).toBe(2);
    expect(
      await db.auditLog.count({
        where: { action: "user.login", actorId: registered.user.id },
      }),
    ).toBe(1);
  });

  it("extends only remembered sessions to the documented duration", async () => {
    const registered = await registerUser(baseRegistration);
    const remembered = await loginUser({
      email: baseRegistration.email,
      password: baseRegistration.password,
      remember: true,
    });
    const now = Date.now();
    expect(registered.expiresAt.getTime() - now).toBeGreaterThan(
      (DEFAULT_SESSION_SECONDS - 30) * 1000,
    );
    expect(registered.expiresAt.getTime() - now).toBeLessThanOrEqual(
      DEFAULT_SESSION_SECONDS * 1000,
    );
    expect(remembered.expiresAt.getTime() - now).toBeGreaterThan(
      (REMEMBERED_SESSION_SECONDS - 30) * 1000,
    );
    expect(remembered.expiresAt.getTime() - now).toBeLessThanOrEqual(
      REMEMBERED_SESSION_SECONDS * 1000,
    );
  });

  it("rejects a wrong password and writes authentication.failed safely", async () => {
    const registered = await registerUser(baseRegistration);
    await expect(
      loginUser({
        email: baseRegistration.email,
        password: "definitely-wrong",
        remember: false,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "authentication.failed", actorId: registered.user.id },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(
      baseRegistration.email,
    );
    expect(JSON.stringify(audit.metadata)).not.toContain("definitely-wrong");
  });

  it("rejects a suspended account with an explicit safe error", async () => {
    const registered = await registerUser(baseRegistration);
    await db.user.update({
      where: { id: registered.user.id },
      data: { status: UserStatus.SUSPENDED },
    });
    await expect(
      loginUser({
        email: baseRegistration.email,
        password: baseRegistration.password,
        remember: false,
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" });
  });

  it("resolves a valid session then invalidates it on logout", async () => {
    const registered = await registerUser(baseRegistration);
    expect((await getSessionUser(registered.token))?.id).toBe(
      registered.user.id,
    );
    expect(await logoutSession(registered.token)).toBe(true);
    expect(
      await db.session.findUnique({
        where: { tokenHash: hashSessionToken(registered.token) },
      }),
    ).toBeNull();
    expect(await getSessionUser(registered.token)).toBeNull();
    expect(
      await db.auditLog.count({
        where: { action: "user.logout", actorId: registered.user.id },
      }),
    ).toBe(1);
  });

  it("rejects and removes an expired persisted session", async () => {
    const registered = await registerUser(baseRegistration);
    await db.session.update({
      where: { tokenHash: hashSessionToken(registered.token) },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(await getSessionUser(registered.token)).toBeNull();
    expect(
      await db.session.count({
        where: { tokenHash: hashSessionToken(registered.token) },
      }),
    ).toBe(0);
  });

  it("rejects an orphaned session result without throwing", async () => {
    const registered = await registerUser(baseRegistration);
    const session = await db.session.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(registered.token) },
    });
    await db.user.delete({ where: { id: registered.user.id } });
    await expect(getSessionUser(registered.token)).resolves.toBeNull();
    expect(
      await db.session.findUnique({ where: { id: session.id } }),
    ).toBeNull();
  });

  it("enforces platform RBAC for USER and ADMIN", async () => {
    const registered = await registerUser(baseRegistration);
    expect(canAccessAdmin(registered.user.systemRole)).toBe(false);
    const admin = await db.user.update({
      where: { id: registered.user.id },
      data: { systemRole: SystemRole.ADMIN },
    });
    expect(canAccessAdmin(admin.systemRole)).toBe(true);
    expect(canAccessAdmin(SystemRole.SUPER_ADMIN)).toBe(true);
  });

  it("enforces persisted organization roles and permissions", async () => {
    const registered = await registerUser(baseRegistration);
    const permission = await db.permission.create({
      data: { key: "organization.manage" },
    });
    const organization = await db.organization.create({
      data: {
        name: "Integration Organization",
        slug: `integration-${Date.now()}`,
        roles: {
          create: {
            name: "Owner",
            key: "OWNER",
            permissions: { create: { permissionId: permission.id } },
          },
        },
      },
      include: { roles: true },
    });
    await db.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: registered.user.id,
        roleId: organization.roles[0].id,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
    const user = await getSessionUser(registered.token);
    expect(
      user && hasPermission(user, "organization.manage", organization.id),
    ).toBe(true);
    expect(
      user && hasPermission(user, "organization.delete", organization.id),
    ).toBe(false);
  });
});
