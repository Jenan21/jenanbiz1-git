import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SystemRole } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashSessionToken } from "@/lib/auth/token";
import { registerSchema } from "@/lib/auth/validation";
import { hasPermission } from "@/lib/auth/authorization";
import {
  canAccessAdmin,
  getSessionUser,
  loginUser,
  logoutSession,
  registerUser,
} from "@/services/auth/auth.service";

const baseRegistration = {
  displayName: "Integration User",
  email: "integration.user@example.test",
  password: "Correct-Horse-2026!",
  locale: "en" as const,
  language: "en" as const,
  countryCode: "SA",
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
      profile: { locale: "en", language: "en", countryCode: "SA" },
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
