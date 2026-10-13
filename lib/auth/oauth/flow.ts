import { createHash, randomBytes } from "node:crypto";
import {
  createAppleClientSecret,
  OAuthTokenError,
  verifyIdToken,
} from "@/lib/auth/oauth/jwt";
import {
  type Environment,
  getAppleCredentials,
  getGoogleCredentials,
  oauthRedirectUri,
  providerDefinitions,
} from "@/lib/auth/oauth/providers";
import type { OAuthEntryPoint, OAuthProviderId } from "@/lib/auth/oauth/shared";
import type { OAuthTransaction } from "@/lib/auth/oauth/transaction";

type Fetcher = typeof fetch;

/** What a verified ID token tells us about the person. */
export interface OAuthProfile {
  provider: OAuthProviderId;
  /** The provider's stable subject identifier; the only value used to recognise the identity later. */
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export class OAuthFlowError extends Error {
  constructor(public readonly code: "UNAVAILABLE" | "EXCHANGE_FAILED") {
    super(code);
    this.name = "OAuthFlowError";
  }
}

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function clientIdOf(provider: OAuthProviderId, env: Environment) {
  return (provider === "google" ? getGoogleCredentials(env)?.clientId : getAppleCredentials(env)?.clientId) ?? null;
}

export interface AuthorizationRequestInput {
  provider: OAuthProviderId;
  origin: string;
  locale: "ar" | "en";
  from: OAuthEntryPoint;
  next: string | null;
  env: Environment;
  now?: number;
}

/** Builds the provider's authorization URL together with the transaction the browser must carry back. */
export function createAuthorizationRequest(input: AuthorizationRequestInput) {
  const clientId = clientIdOf(input.provider, input.env);
  if (!clientId) throw new OAuthFlowError("UNAVAILABLE");
  const definition = providerDefinitions[input.provider];
  const transaction: OAuthTransaction = {
    provider: input.provider,
    state: randomToken(),
    nonce: randomToken(),
    verifier: definition.usesPkce ? randomToken() : "",
    from: input.from,
    next: input.next,
    locale: input.locale,
    issuedAt: input.now ?? Date.now(),
  };
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: oauthRedirectUri(input.provider, input.origin),
    scope: definition.scope,
    state: transaction.state,
    nonce: transaction.nonce,
  });
  if (definition.responseMode === "form_post") query.set("response_mode", "form_post");
  if (definition.usesPkce) {
    query.set("code_challenge", createHash("sha256").update(transaction.verifier).digest("base64url"));
    query.set("code_challenge_method", "S256");
  }
  if (input.provider === "google") query.set("prompt", "select_account");
  return { url: `${definition.authorizationEndpoint}?${query.toString()}`, transaction };
}

export interface CodeExchangeInput {
  provider: OAuthProviderId;
  code: string;
  origin: string;
  transaction: OAuthTransaction;
  env: Environment;
  fetcher?: Fetcher;
  now?: number;
  /** Apple sends the display name only on the very first authorization, as a `user` form field. */
  nameHint?: string | null;
}

/** Trades the authorization code for an ID token, verifies it, and returns the person's profile. */
export async function completeAuthorization(input: CodeExchangeInput): Promise<OAuthProfile> {
  const definition = providerDefinitions[input.provider];
  const fetcher = input.fetcher ?? fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: oauthRedirectUri(input.provider, input.origin),
  });
  let clientId: string;
  if (input.provider === "google") {
    const credentials = getGoogleCredentials(input.env);
    if (!credentials) throw new OAuthFlowError("UNAVAILABLE");
    clientId = credentials.clientId;
    body.set("client_id", credentials.clientId);
    body.set("client_secret", credentials.clientSecret);
    body.set("code_verifier", input.transaction.verifier);
  } else {
    const credentials = getAppleCredentials(input.env);
    if (!credentials) throw new OAuthFlowError("UNAVAILABLE");
    clientId = credentials.clientId;
    body.set("client_id", credentials.clientId);
    body.set("client_secret", createAppleClientSecret({ ...credentials, now: input.now }));
  }

  let idToken: string;
  try {
    const response = await fetcher(definition.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new OAuthFlowError("EXCHANGE_FAILED");
    const payload = (await response.json()) as { id_token?: unknown };
    if (typeof payload.id_token !== "string") throw new OAuthFlowError("EXCHANGE_FAILED");
    idToken = payload.id_token;
  } catch (error) {
    if (error instanceof OAuthFlowError) throw error;
    throw new OAuthFlowError("EXCHANGE_FAILED");
  }

  const claims = await verifyIdToken(idToken, {
    jwksUri: definition.jwksUri,
    issuers: definition.issuers,
    audience: clientId,
    nonce: input.transaction.nonce,
    fetcher,
    now: input.now,
  });

  const email = typeof claims.email === "string" && claims.email.includes("@") ? claims.email.trim().toLowerCase() : null;
  // Google sends a boolean, Apple sends the string "true".
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  const claimedName = typeof claims.name === "string" ? claims.name : null;
  return {
    provider: input.provider,
    subject: claims.sub,
    email,
    emailVerified,
    name: (claimedName ?? input.nameHint ?? "").trim() || null,
  };
}

export { OAuthTokenError };
