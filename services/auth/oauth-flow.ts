import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { isPublicRegistrationAllowed } from "@/lib/auth/registration-policy";
import { accountApprovalRequired } from "@/lib/auth/account-approval-policy";
import {
  completeAuthorization,
  createAuthorizationRequest,
  OAuthFlowError,
  OAuthTokenError,
} from "@/lib/auth/oauth/flow";
import {
  type Environment,
  getOAuthSecret,
  isOAuthProviderConfigured,
} from "@/lib/auth/oauth/providers";
import {
  oauthErrorPath,
  type OAuthEntryPoint,
  type OAuthErrorCode,
  type OAuthProviderId,
} from "@/lib/auth/oauth/shared";
import {
  OAUTH_COOKIE,
  openTransaction,
  sealTransaction,
  transactionCookieOptions,
} from "@/lib/auth/oauth/transaction";
import type { RequestContext } from "@/services/auth/auth.service";
import { OAuthSignInError, signInWithOAuthProfile } from "@/services/auth/oauth-service";

type Fetcher = typeof fetch;

export interface StartOAuthInput {
  provider: OAuthProviderId;
  origin: string;
  locale: "ar" | "en";
  from: OAuthEntryPoint;
  next: string | null;
  env: Environment;
}

export type StartOAuthResult =
  | {
      ok: true;
      location: string;
      cookie: { name: string; value: string; options: ReturnType<typeof transactionCookieOptions> };
    }
  | { ok: false; location: string };

/** Starts a sign-in: returns the provider URL plus the signed transaction cookie to set on the browser. */
export function startOAuth(input: StartOAuthInput): StartOAuthResult {
  const secret = getOAuthSecret(input.env);
  if (!secret || !isOAuthProviderConfigured(input.provider, input.env))
    return { ok: false, location: oauthErrorPath(input.from, input.provider, "unavailable", input.next) };
  const { url, transaction } = createAuthorizationRequest(input);
  return {
    ok: true,
    location: url,
    cookie: {
      name: OAUTH_COOKIE,
      value: sealTransaction(transaction, secret),
      options: transactionCookieOptions(input.provider, input.origin.startsWith("https://")),
    },
  };
}

export interface FinishOAuthInput {
  provider: OAuthProviderId;
  origin: string;
  env: Environment;
  params: { code?: string | null; state?: string | null; error?: string | null; user?: string | null };
  cookieValue?: string;
  context: RequestContext;
  countryCode?: string | null;
  fetcher?: Fetcher;
  now?: number;
}

export type FinishOAuthResult =
  | { ok: true; location: string; created: boolean; session: { token: string; expiresAt: Date } }
  | { ok: false; location: string; code: OAuthErrorCode };

const signInErrorCodes = {
  ACCOUNT_DISABLED: "account_disabled",
  ACCOUNT_EXISTS: "account_exists",
  EMAIL_MISSING: "email_missing",
  EMAIL_UNVERIFIED: "email_unverified",
  PENDING_APPROVAL: "pending_approval",
  REGISTRATION_CLOSED: "registration_closed",
} as const satisfies Record<OAuthSignInError["code"], OAuthErrorCode>;

function sameValue(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function appleNameHint(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { name?: { firstName?: string; lastName?: string } };
    return [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(" ").trim() || null;
  } catch {
    return null;
  }
}

async function recordFailure(
  provider: OAuthProviderId,
  code: OAuthErrorCode,
  context: RequestContext,
) {
  if (code === "denied") return;
  try {
    await db.auditLog.create({
      data: {
        action: "authentication.failed",
        entityType: "User",
        ipAddress: context.ipAddress,
        metadata: { reason: `oauth_${code}`, provider },
      },
    });
  } catch {
    // Auditing a failed attempt must never turn into a second failure for the visitor.
  }
}

/** Completes a sign-in from the provider's redirect back to us. Always yields a location to send the browser to. */
export async function finishOAuth(input: FinishOAuthInput): Promise<FinishOAuthResult> {
  const secret = getOAuthSecret(input.env);
  const transaction = secret ? openTransaction(input.cookieValue, secret, input.now) : null;
  const fail = async (code: OAuthErrorCode, entry: OAuthEntryPoint = "login", next: string | null = null) => {
    await recordFailure(input.provider, code, input.context);
    return { ok: false as const, code, location: oauthErrorPath(entry, input.provider, code, next) };
  };

  if (!secret || !isOAuthProviderConfigured(input.provider, input.env)) return fail("unavailable");
  // Without a transaction signed for this exact provider and state, nothing in the request can be trusted.
  if (!transaction || transaction.provider !== input.provider) return fail("failed");
  if (!input.params.state || !sameValue(input.params.state, transaction.state))
    return fail("failed", transaction.from, transaction.next);
  if (input.params.error)
    return fail(
      input.params.error === "access_denied" || input.params.error === "user_cancelled_authorize" ? "denied" : "failed",
      transaction.from,
      transaction.next,
    );
  if (!input.params.code) return fail("failed", transaction.from, transaction.next);

  try {
    const profile = await completeAuthorization({
      provider: input.provider,
      code: input.params.code,
      origin: input.origin,
      transaction,
      env: input.env,
      fetcher: input.fetcher,
      now: input.now,
      nameHint: appleNameHint(input.params.user),
    });
    const result = await signInWithOAuthProfile(
      profile,
      {
        locale: transaction.locale,
        countryCode: input.countryCode,
        registrationOpen: isPublicRegistrationAllowed(input.env),
        approvalRequired: accountApprovalRequired(input.env),
      },
      input.context,
    );
    return {
      ok: true,
      created: result.created,
      location: result.created ? "/user/onboarding" : (transaction.next ?? "/dashboard"),
      session: { token: result.token, expiresAt: result.expiresAt },
    };
  } catch (error) {
    if (error instanceof OAuthSignInError)
      return fail(signInErrorCodes[error.code], transaction.from, transaction.next);
    if (error instanceof OAuthFlowError && error.code === "UNAVAILABLE")
      return fail("unavailable", transaction.from, transaction.next);
    if (!(error instanceof OAuthTokenError) && !(error instanceof OAuthFlowError))
      console.error("OAuth sign-in failed without exposing request data");
    return fail("failed", transaction.from, transaction.next);
  }
}
