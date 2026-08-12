import { createHash, randomBytes } from "node:crypto";
import { Prisma, SystemRole, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSessionToken,
  hashSessionToken,
  DEFAULT_SESSION_SECONDS,
  REMEMBERED_SESSION_SECONDS,
} from "@/lib/auth/token";
import type { LoginData, RegisterData } from "@/lib/auth/validation";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";

export class AuthenticationError extends Error {
  constructor(
    public code: "INVALID_CREDENTIALS" | "DUPLICATE_EMAIL" | "ACCOUNT_DISABLED",
  ) {
    super(code);
  }
}
export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

const dummyPasswordHash = hashPassword(randomBytes(32).toString("base64url"));

function expiresIn(seconds: number) {
  return new Date(Date.now() + seconds * 1000);
}
function safeEmailFingerprint(email: string) {
  return createHash("sha256").update(email).digest("hex").slice(0, 16);
}

async function createSession(
  userId: string,
  remembered: boolean,
  tx: Prisma.TransactionClient,
  context: RequestContext,
) {
  const token = createSessionToken();
  const expiresAt = expiresIn(
    remembered ? REMEMBERED_SESSION_SECONDS : DEFAULT_SESSION_SECONDS,
  );
  const session = await tx.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });
  return { token, expiresAt, sessionId: session.id };
}

export async function registerUser(
  input: RegisterData,
  context: RequestContext = {},
) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          status: UserStatus.ACTIVE,
          systemRole: SystemRole.USER,
          profile: {
            create: {
              displayName: input.displayName,
              locale: input.locale,
              language: input.language,
              countryCode: input.countryCode,
            },
          },
        },
        include: { profile: true },
      });
      const session = await createSession(user.id, false, tx, context);
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "user.registered",
          entityType: "User",
          entityId: user.id,
          ipAddress: context.ipAddress,
          metadata: { locale: input.locale, countryCode: input.countryCode },
        },
      });
      return { user, ...session };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new AuthenticationError("DUPLICATE_EMAIL");
    throw error;
  }
}

export async function loginUser(
  input: LoginData,
  context: RequestContext = {},
) {
  const userWithHash = await db.user.findUnique({
    where: { email: input.email },
  });
  const candidateHash = userWithHash?.passwordHash ?? (await dummyPasswordHash);
  const valid = await verifyPassword(candidateHash, input.password);
  if (!userWithHash || !valid) {
    await db.auditLog.create({
      data: {
        actorId: userWithHash?.id,
        action: "authentication.failed",
        entityType: "User",
        entityId: userWithHash?.id,
        ipAddress: context.ipAddress,
        metadata: {
          reason: "invalid_credentials",
          emailFingerprint: safeEmailFingerprint(input.email),
        },
      },
    });
    throw new AuthenticationError("INVALID_CREDENTIALS");
  }
  if (userWithHash.status !== UserStatus.ACTIVE)
    throw new AuthenticationError("ACCOUNT_DISABLED");
  return db.$transaction(async (tx) => {
    const session = await createSession(
      userWithHash.id,
      input.remember,
      tx,
      context,
    );
    await tx.auditLog.create({
      data: {
        actorId: userWithHash.id,
        action: "user.login",
        entityType: "User",
        entityId: userWithHash.id,
        ipAddress: context.ipAddress,
      },
    });
    return { user: userWithHash, ...session };
  });
}

export async function logoutSession(
  token: string,
  context: RequestContext = {},
) {
  const tokenHash = hashSessionToken(token);
  const session = await db.session.findUnique({ where: { tokenHash } });
  if (!session) return false;
  await db.$transaction([
    db.session.delete({ where: { id: session.id } }),
    db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "user.logout",
        entityType: "Session",
        entityId: session.id,
        ipAddress: context.ipAddress,
      },
    }),
  ]);
  return true;
}

export async function getSessionUser(token: string) {
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        omit: { passwordHash: true },
        include: {
          profile: true,
          memberships: {
            include: {
              role: {
                include: { permissions: { include: { permission: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (
    !session ||
    session.expiresAt <= new Date() ||
    session.user.status !== UserStatus.ACTIVE
  ) {
    if (session) await db.session.delete({ where: { id: session.id } });
    return null;
  }
  return session.user;
}

export function canAccessAdmin(systemRole: SystemRole) {
  return hasPlatformAdminAccess(systemRole);
}

export type AuthenticationService =
  typeof import("@/services/auth/auth.service");
