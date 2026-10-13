import { describe, expect, it } from "vitest";
import { createAuthorizationRequest, OAuthFlowError } from "@/lib/auth/oauth/flow";
import {
  getOAuthAvailability,
  oauthRedirectUri,
  resolvePublicOrigin,
} from "@/lib/auth/oauth/providers";
import {
  oauthErrorPath,
  oauthNotice,
  oauthStartPath,
  sanitizeNextPath,
} from "@/lib/auth/oauth/shared";
import {
  openTransaction,
  sealTransaction,
  transactionCookieOptions,
  type OAuthTransaction,
} from "@/lib/auth/oauth/transaction";

const SECRET = "unit-test-secret-value-0123456789";
const env = {
  AUTH_SECRET: SECRET,
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
  APPLE_CLIENT_ID: "com.example.web",
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_KEY_ID: "KEY1234567",
  APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
};

const transaction: OAuthTransaction = {
  provider: "google",
  state: "state-1",
  nonce: "nonce-1",
  verifier: "verifier-1",
  from: "login",
  next: "/projects",
  locale: "ar",
  issuedAt: 1_000_000,
};

describe("OAuth provider availability", () => {
  it("enables a provider only when every credential and the signing secret are present", () => {
    expect(getOAuthAvailability(env)).toEqual({ google: true, apple: true });
    expect(getOAuthAvailability({})).toEqual({ google: false, apple: false });
    expect(getOAuthAvailability({ ...env, AUTH_SECRET: "" })).toEqual({ google: false, apple: false });
    expect(getOAuthAvailability({ ...env, GOOGLE_CLIENT_SECRET: " " })).toEqual({ google: false, apple: true });
    expect(getOAuthAvailability({ ...env, APPLE_KEY_ID: undefined })).toEqual({ google: true, apple: false });
  });

  it("builds the registered redirect URI from the configured public origin", () => {
    expect(resolvePublicOrigin({ NEXT_PUBLIC_APP_URL: "https://app.example.test/some/path" }, "http://127.0.0.1:3000")).toBe(
      "https://app.example.test",
    );
    expect(resolvePublicOrigin({}, "http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(resolvePublicOrigin({ NEXT_PUBLIC_APP_URL: "not a url" }, "http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(oauthRedirectUri("apple", "https://app.example.test")).toBe("https://app.example.test/api/auth/oauth/apple/callback");
  });
});

describe("OAuth authorization requests", () => {
  it("asks Google for an OpenID code with PKCE, state and nonce", () => {
    const { url, transaction: created } = createAuthorizationRequest({
      provider: "google", origin: "https://app.example.test", locale: "en", from: "register", next: "/dashboard", env,
    });
    const target = new URL(url);
    expect(target.origin + target.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(target.searchParams.get("response_type")).toBe("code");
    expect(target.searchParams.get("client_id")).toBe("google-client");
    expect(target.searchParams.get("redirect_uri")).toBe("https://app.example.test/api/auth/oauth/google/callback");
    expect(target.searchParams.get("scope")).toBe("openid email profile");
    expect(target.searchParams.get("state")).toBe(created.state);
    expect(target.searchParams.get("nonce")).toBe(created.nonce);
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(target.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created).toMatchObject({ provider: "google", from: "register", next: "/dashboard", locale: "en" });
  });

  it("asks Apple for a form_post response with name and email scopes", () => {
    const { url, transaction: created } = createAuthorizationRequest({
      provider: "apple", origin: "https://app.example.test", locale: "ar", from: "login", next: null, env,
    });
    const target = new URL(url);
    expect(target.origin + target.pathname).toBe("https://appleid.apple.com/auth/authorize");
    expect(target.searchParams.get("client_id")).toBe("com.example.web");
    expect(target.searchParams.get("response_mode")).toBe("form_post");
    expect(target.searchParams.get("scope")).toBe("name email");
    expect(target.searchParams.get("code_challenge")).toBeNull();
    expect(created.verifier).toBe("");
  });

  it("uses a fresh state and nonce every time", () => {
    const input = { provider: "google" as const, origin: "https://app.example.test", locale: "en" as const, from: "login" as const, next: null, env };
    const first = createAuthorizationRequest(input).transaction;
    const second = createAuthorizationRequest(input).transaction;
    expect(first.state).not.toBe(second.state);
    expect(first.nonce).not.toBe(second.nonce);
  });

  it("refuses to start when the provider is not configured", () => {
    expect(() =>
      createAuthorizationRequest({ provider: "google", origin: "https://app.example.test", locale: "en", from: "login", next: null, env: {} }),
    ).toThrow(OAuthFlowError);
  });
});

describe("OAuth transaction cookie", () => {
  it("round-trips a transaction signed with the secret", () => {
    const sealed = sealTransaction(transaction, SECRET);
    expect(openTransaction(sealed, SECRET, transaction.issuedAt + 1000)).toEqual(transaction);
  });

  it("rejects tampering, a different secret, expiry and malformed values", () => {
    const sealed = sealTransaction(transaction, SECRET);
    const [payload, signature] = sealed.split(".");
    const forged = Buffer.from(JSON.stringify({ ...transaction, state: "attacker" })).toString("base64url");
    expect(openTransaction(`${forged}.${signature}`, SECRET, transaction.issuedAt + 1000)).toBeNull();
    expect(openTransaction(`${payload}.${signature}x`, SECRET, transaction.issuedAt + 1000)).toBeNull();
    expect(openTransaction(sealed, "another-secret", transaction.issuedAt + 1000)).toBeNull();
    expect(openTransaction(sealed, SECRET, transaction.issuedAt + 11 * 60 * 1000)).toBeNull();
    expect(openTransaction(sealed, SECRET, transaction.issuedAt - 5 * 60 * 1000)).toBeNull();
    expect(openTransaction(undefined, SECRET)).toBeNull();
    expect(openTransaction("garbage", SECRET)).toBeNull();
    expect(openTransaction(`${sealed}.extra`, SECRET, transaction.issuedAt + 1000)).toBeNull();
  });

  it("scopes the cookie to the OAuth routes and lets Apple's cross-site POST carry it over HTTPS only", () => {
    expect(transactionCookieOptions("google", true)).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth/oauth" });
    expect(transactionCookieOptions("apple", true).sameSite).toBe("none");
    expect(transactionCookieOptions("apple", false).sameSite).toBe("lax");
  });
});

describe("OAuth helpers shared with the sign-in panels", () => {
  it("only accepts same-site paths as a destination", () => {
    expect(sanitizeNextPath("/projects?tab=1")).toBe("/projects?tab=1");
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil", "javascript:alert(1)", "/a\nb", "", null, undefined, `/${"a".repeat(600)}`]) {
      expect(sanitizeNextPath(bad as string | null | undefined)).toBeNull();
    }
  });

  it("builds the start and error paths with a validated next parameter", () => {
    expect(oauthStartPath("google", { from: "login", next: "/projects" })).toBe("/api/auth/oauth/google/start?from=login&next=%2Fprojects");
    expect(oauthStartPath("apple", { from: "register", next: "//evil" })).toBe("/api/auth/oauth/apple/start?from=register");
    expect(oauthErrorPath("register", "google", "denied", "/x")).toBe("/register?oauth_error=denied&oauth_provider=google&next=%2Fx");
  });

  it("explains an error in the visitor's language and ignores unknown codes", () => {
    expect(oauthNotice("en", "denied", "google")).toBe("Google sign-in was cancelled.");
    expect(oauthNotice("ar", "denied", "apple")).toBe("تم إلغاء الدخول عبر Apple.");
    expect(oauthNotice("en", "<script>", "google")).toBeNull();
    expect(oauthNotice("en", null, null)).toBeNull();
  });
});
