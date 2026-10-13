import type { OAuthProviderId } from "@/lib/auth/oauth/shared";

export type Environment = Record<string, string | undefined>;

export interface OAuthProviderDefinition {
  id: OAuthProviderId;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  /** Accepted `iss` values of the ID token. */
  issuers: readonly string[];
  scope: string;
  /** Apple only delivers the name/email scopes through a cross-site form POST. */
  responseMode: "query" | "form_post";
  usesPkce: boolean;
}

export const providerDefinitions: Record<OAuthProviderId, OAuthProviderDefinition> = {
  google: {
    id: "google",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
    issuers: ["https://accounts.google.com", "accounts.google.com"],
    scope: "openid email profile",
    responseMode: "query",
    usesPkce: true,
  },
  apple: {
    id: "apple",
    authorizationEndpoint: "https://appleid.apple.com/auth/authorize",
    tokenEndpoint: "https://appleid.apple.com/auth/token",
    jwksUri: "https://appleid.apple.com/auth/keys",
    issuers: ["https://appleid.apple.com"],
    scope: "name email",
    responseMode: "form_post",
    usesPkce: false,
  },
};

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

export interface AppleCredentials {
  /** The Services ID registered for "Sign in with Apple" on the web. */
  clientId: string;
  teamId: string;
  keyId: string;
  /** PEM contents of the .p8 key. `\n` sequences are accepted so it fits in one env line. */
  privateKey: string;
}

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getGoogleCredentials(env: Environment = process.env): GoogleCredentials | null {
  const clientId = clean(env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(env.GOOGLE_CLIENT_SECRET);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function getAppleCredentials(env: Environment = process.env): AppleCredentials | null {
  const clientId = clean(env.APPLE_CLIENT_ID);
  const teamId = clean(env.APPLE_TEAM_ID);
  const keyId = clean(env.APPLE_KEY_ID);
  const rawKey = clean(env.APPLE_PRIVATE_KEY);
  if (!clientId || !teamId || !keyId || !rawKey) return null;
  return { clientId, teamId, keyId, privateKey: rawKey.replace(/\\n/g, "\n") };
}

/** The signing key for the short-lived OAuth transaction cookie. */
export function getOAuthSecret(env: Environment = process.env) {
  return clean(env.AUTH_SECRET);
}

export function isOAuthProviderConfigured(id: OAuthProviderId, env: Environment = process.env) {
  if (!getOAuthSecret(env)) return false;
  return id === "google" ? getGoogleCredentials(env) !== null : getAppleCredentials(env) !== null;
}

export function getOAuthAvailability(env: Environment = process.env): Record<OAuthProviderId, boolean> {
  return {
    google: isOAuthProviderConfigured("google", env),
    apple: isOAuthProviderConfigured("apple", env),
  };
}

/** The public origin registered with the provider; falls back to the request origin when unset. */
export function resolvePublicOrigin(env: Environment, requestOrigin: string) {
  const configured = clean(env.NEXT_PUBLIC_APP_URL);
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the request origin.
    }
  }
  return requestOrigin;
}

export function oauthRedirectUri(id: OAuthProviderId, origin: string) {
  return `${origin}/api/auth/oauth/${id}/callback`;
}
