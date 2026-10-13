import { AuthIdentityProvider, Prisma, SystemRole, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { OAuthProfile } from "@/lib/auth/oauth/flow";
import type { OAuthProviderId } from "@/lib/auth/oauth/shared";
import { createSession, type RequestContext } from "@/services/auth/auth.service";

export type OAuthSignInErrorCode =
  | "ACCOUNT_DISABLED"
  | "ACCOUNT_EXISTS"
  | "EMAIL_MISSING"
  | "EMAIL_UNVERIFIED"
  | "REGISTRATION_CLOSED";

export class OAuthSignInError extends Error {
  constructor(public readonly code: OAuthSignInErrorCode) {
    super(code);
    this.name = "OAuthSignInError";
  }
}

export interface OAuthSignInOptions {
  locale: "ar" | "en";
  /** ISO country detected from the network, when known. */
  countryCode?: string | null;
  /** Whether a brand-new account may be created (the same policy as the password registration route). */
  registrationOpen: boolean;
}

const providerEnum: Record<OAuthProviderId, AuthIdentityProvider> = {
  google: AuthIdentityProvider.GOOGLE,
  apple: AuthIdentityProvider.APPLE,
};

function displayNameFor(profile: OAuthProfile, email: string) {
  const candidate = (profile.name ?? email.split("@")[0] ?? "").trim().slice(0, 80);
  return candidate.length >= 2 ? candidate : "Jenan user";
}

async function attemptSignIn(
  profile: OAuthProfile,
  options: OAuthSignInOptions,
  context: RequestContext,
) {
  const provider = providerEnum[profile.provider];
  return db.$transaction(async (tx) => {
    const identity = await tx.authIdentity.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: profile.subject } },
      include: { user: true },
    });

    if (identity) {
      if (identity.user.status !== UserStatus.ACTIVE) throw new OAuthSignInError("ACCOUNT_DISABLED");
      await tx.authIdentity.update({
        where: { id: identity.id },
        data: { lastUsedAt: new Date(), ...(profile.email ? { email: profile.email } : {}) },
      });
      const session = await createSession(identity.user.id, false, tx, context);
      await tx.auditLog.create({
        data: {
          actorId: identity.user.id,
          action: "user.login",
          entityType: "User",
          entityId: identity.user.id,
          ipAddress: context.ipAddress,
          metadata: { method: profile.provider },
        },
      });
      return { user: identity.user, created: false, ...session };
    }

    if (!profile.email) throw new OAuthSignInError("EMAIL_MISSING");
    if (!profile.emailVerified) throw new OAuthSignInError("EMAIL_UNVERIFIED");
    const email = profile.email;

    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.status !== UserStatus.ACTIVE) throw new OAuthSignInError("ACCOUNT_DISABLED");
      // An unverified password account might have been created by someone who does not own the address.
      // It is linked only when no such squatter can exist: the address was verified before, the account
      // has no password, or public sign-up is closed so every account was provisioned by an administrator.
      const linkable =
        existing.emailVerifiedAt !== null || existing.passwordHash === null || !options.registrationOpen;
      if (!linkable) throw new OAuthSignInError("ACCOUNT_EXISTS");
      await tx.authIdentity.create({
        data: { userId: existing.id, provider, providerAccountId: profile.subject, email, lastUsedAt: new Date() },
      });
      const user =
        existing.emailVerifiedAt === null
          ? await tx.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } })
          : existing;
      const session = await createSession(user.id, false, tx, context);
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "user.oauth_linked",
          entityType: "User",
          entityId: user.id,
          ipAddress: context.ipAddress,
          metadata: { provider: profile.provider },
        },
      });
      return { user, created: false, ...session };
    }

    if (!options.registrationOpen) throw new OAuthSignInError("REGISTRATION_CLOSED");
    const user = await tx.user.create({
      data: {
        email,
        passwordHash: null,
        status: UserStatus.ACTIVE,
        systemRole: SystemRole.USER,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            displayName: displayNameFor(profile, email),
            locale: options.locale,
            language: options.locale,
            countryCode: options.countryCode ?? undefined,
          },
        },
        authIdentities: {
          create: { provider, providerAccountId: profile.subject, email, lastUsedAt: new Date() },
        },
      },
    });
    const session = await createSession(user.id, false, tx, context);
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "user.registered",
        entityType: "User",
        entityId: user.id,
        ipAddress: context.ipAddress,
        metadata: { locale: options.locale, countryCode: options.countryCode ?? null, method: profile.provider },
      },
    });
    return { user, created: true, ...session };
  });
}

/**
 * Signs a person in from a verified provider profile: returns the user of a known identity, links a
 * verified address to an existing account, or creates a new account when registration is open.
 */
export async function signInWithOAuthProfile(
  profile: OAuthProfile,
  options: OAuthSignInOptions,
  context: RequestContext = {},
) {
  try {
    return await attemptSignIn(profile, options, context);
  } catch (error) {
    // Two simultaneous first sign-ins for the same person race on the unique keys; the second sees the winner.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return attemptSignIn(profile, options, context);
    throw error;
  }
}
