import { createSign, generateKeyPairSync } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthIdentityProvider, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { clearJwksCache } from "@/lib/auth/oauth/jwt";
import type { OAuthProfile } from "@/lib/auth/oauth/flow";
import { OAUTH_COOKIE } from "@/lib/auth/oauth/transaction";
import { hashSessionToken } from "@/lib/auth/token";
import { registerUser } from "@/services/auth/auth.service";
import { finishOAuth, startOAuth } from "@/services/auth/oauth-flow";
import { OAuthSignInError, signInWithOAuthProfile } from "@/services/auth/oauth-service";

const EMAIL_PREFIX = "oauth.integration";
const email = (name: string) => `${EMAIL_PREFIX}.${name}@example.test`;

const profile = (overrides: Partial<OAuthProfile> = {}): OAuthProfile => ({
  provider: "google",
  subject: "google-subject-1",
  email: email("new"),
  emailVerified: true,
  name: "Layla Nasser",
  ...overrides,
});

const open = { locale: "ar" as const, countryCode: "SA", registrationOpen: true };
const closed = { locale: "ar" as const, countryCode: null, registrationOpen: false };

async function cleanup() {
  const users = await db.user.findMany({ where: { email: { startsWith: EMAIL_PREFIX } }, select: { id: true } });
  const ids = users.map(({ id }) => id);
  await db.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { entityType: "User", entityId: { in: ids } }, { action: "authentication.failed", metadata: { path: ["provider"], equals: "google" } }] },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

async function codeFailures() {
  return db.auditLog.count({ where: { action: "authentication.failed", metadata: { path: ["reason"], string_starts_with: "oauth_" } } });
}

describe.sequential("OAuth sign-in against PostgreSQL", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
  });

  it("creates a verified, password-less account with a profile, identity, session and audit entry", async () => {
    const result = await signInWithOAuthProfile(profile(), open, { ipAddress: "203.0.113.7", userAgent: "vitest" });
    expect(result.created).toBe(true);

    const user = await db.user.findUniqueOrThrow({
      where: { id: result.user.id },
      include: { profile: true, authIdentities: true, sessions: true },
    });
    expect(user.email).toBe(email("new"));
    expect(user.passwordHash).toBeNull();
    expect(user.status).toBe(UserStatus.ACTIVE);
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.profile).toMatchObject({ displayName: "Layla Nasser", locale: "ar", language: "ar", countryCode: "SA" });
    expect(user.profile?.onboardedAt).toBeNull();
    expect(user.authIdentities).toHaveLength(1);
    expect(user.authIdentities[0]).toMatchObject({ provider: AuthIdentityProvider.GOOGLE, providerAccountId: "google-subject-1" });
    expect(user.sessions).toHaveLength(1);
    expect(user.sessions[0].tokenHash).toBe(hashSessionToken(result.token));
    expect(user.sessions[0].ipAddress).toBe("203.0.113.7");

    const audit = await db.auditLog.findFirstOrThrow({ where: { actorId: user.id, action: "user.registered" } });
    expect(audit.metadata).toMatchObject({ method: "google", locale: "ar" });
  });

  it("recognises a returning identity by its subject even if the email changed", async () => {
    const first = await signInWithOAuthProfile(profile(), open);
    const again = await signInWithOAuthProfile(profile({ email: email("renamed") }), open);
    expect(again.created).toBe(false);
    expect(again.user.id).toBe(first.user.id);
    expect(await db.authIdentity.count({ where: { userId: first.user.id } })).toBe(1);
    expect(await db.session.count({ where: { userId: first.user.id } })).toBe(2);
    expect(await db.auditLog.count({ where: { actorId: first.user.id, action: "user.login" } })).toBe(1);
  });

  it("keeps Google and Apple identities for the same person on one account", async () => {
    const google = await signInWithOAuthProfile(profile(), open);
    const apple = await signInWithOAuthProfile(profile({ provider: "apple", subject: "apple-subject-1" }), open);
    expect(apple.user.id).toBe(google.user.id);
    expect(await db.authIdentity.count({ where: { userId: google.user.id } })).toBe(2);
  });

  it("links a provider-verified address to an existing account whose email was verified", async () => {
    const existing = await db.user.create({ data: { email: email("verified"), passwordHash: "x", status: UserStatus.ACTIVE, emailVerifiedAt: new Date() } });
    const result = await signInWithOAuthProfile(profile({ email: email("verified") }), open);
    expect(result.created).toBe(false);
    expect(result.user.id).toBe(existing.id);
    expect(await db.auditLog.count({ where: { actorId: existing.id, action: "user.oauth_linked" } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: existing.id } })).passwordHash).toBe("x");
  });

  it("refuses to take over an unverified password account while public sign-up is open", async () => {
    await registerUser({ displayName: "Squatter", email: email("squat"), password: "Correct-Horse-2026!", locale: "en", language: "en", countryCode: "SA" });
    await expect(signInWithOAuthProfile(profile({ email: email("squat") }), open)).rejects.toMatchObject({ code: "ACCOUNT_EXISTS" });
    expect(await db.authIdentity.count({ where: { user: { email: email("squat") } } })).toBe(0);
  });

  it("links an administrator-provisioned account once sign-up is closed and marks the email verified", async () => {
    const provisioned = await db.user.create({ data: { email: email("provisioned"), passwordHash: "x", status: UserStatus.ACTIVE } });
    const result = await signInWithOAuthProfile(profile({ email: email("provisioned") }), closed);
    expect(result.user.id).toBe(provisioned.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: provisioned.id } })).emailVerifiedAt).not.toBeNull();
  });

  it("does not create accounts when registration is closed", async () => {
    await expect(signInWithOAuthProfile(profile(), closed)).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });
    expect(await db.user.count({ where: { email: email("new") } })).toBe(0);
  });

  it("rejects a missing or unverified provider email", async () => {
    await expect(signInWithOAuthProfile(profile({ email: null }), open)).rejects.toMatchObject({ code: "EMAIL_MISSING" });
    await expect(signInWithOAuthProfile(profile({ emailVerified: false }), open)).rejects.toMatchObject({ code: "EMAIL_UNVERIFIED" });
    await expect(signInWithOAuthProfile(profile({ emailVerified: false }), open)).rejects.toBeInstanceOf(OAuthSignInError);
  });

  it("does not sign in a suspended account through a known identity or a matching email", async () => {
    const suspended = await db.user.create({ data: { email: email("suspended"), status: UserStatus.SUSPENDED, emailVerifiedAt: new Date() } });
    await expect(signInWithOAuthProfile(profile({ email: email("suspended") }), open)).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" });
    await db.authIdentity.create({ data: { userId: suspended.id, provider: AuthIdentityProvider.GOOGLE, providerAccountId: "google-subject-1" } });
    await expect(signInWithOAuthProfile(profile(), open)).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" });
    expect(await db.session.count({ where: { userId: suspended.id } })).toBe(0);
  });

  it("survives two simultaneous first sign-ins for the same person", async () => {
    const results = await Promise.allSettled([signInWithOAuthProfile(profile(), open), signInWithOAuthProfile(profile(), open)]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await db.user.count({ where: { email: email("new") } })).toBe(1);
    expect(await db.authIdentity.count({ where: { providerAccountId: "google-subject-1" } })).toBe(1);
  });
});

// A fake Google: an RSA key set plus a token endpoint that returns an ID token for whatever nonce the flow produced.
describe.sequential("OAuth start and callback pipeline (fake provider)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "fake-key", alg: "RS256", use: "sig" };
  const env = {
    AUTH_SECRET: "pipeline-secret-0123456789abcdef",
    GOOGLE_CLIENT_ID: "fake-google-client",
    GOOGLE_CLIENT_SECRET: "fake-google-secret",
    NEXT_PUBLIC_APP_URL: "https://app.example.test",
  };
  const origin = "https://app.example.test";
  const context = { ipAddress: "198.51.100.9", userAgent: "vitest" };

  function idToken(claims: Record<string, unknown>) {
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const input = `${b64({ alg: "RS256", kid: "fake-key", typ: "JWT" })}.${b64({
      iss: "https://accounts.google.com",
      aud: "fake-google-client",
      sub: "pipeline-subject",
      email: email("pipeline"),
      email_verified: true,
      name: "Pipeline Person",
      iat: now - 5,
      exp: now + 600,
      ...claims,
    })}`;
    return `${input}.${createSign("RSA-SHA256").update(input).sign(privateKey).toString("base64url")}`;
  }

  function fakeProvider(options: { claims?: (nonce: string) => Record<string, unknown>; tokenStatus?: number } = {}) {
    let nonce = "";
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("googleapis.com/oauth2/v3/certs")) return new Response(JSON.stringify({ keys: [jwk] }));
      if (target === "https://oauth2.googleapis.com/token") {
        if (options.tokenStatus && options.tokenStatus !== 200) return new Response("{}", { status: options.tokenStatus });
        const body = init?.body as URLSearchParams;
        expect(body.get("grant_type")).toBe("authorization_code");
        expect(body.get("client_id")).toBe("fake-google-client");
        expect(body.get("client_secret")).toBe("fake-google-secret");
        expect(body.get("redirect_uri")).toBe("https://app.example.test/api/auth/oauth/google/callback");
        expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
        return new Response(JSON.stringify({ id_token: idToken(options.claims?.(nonce) ?? { nonce }) }));
      }
      throw new Error(`unexpected fetch ${target}`);
    }) as unknown as typeof fetch;
    return {
      fetcher,
      begin(next: string | null = "/projects") {
        const started = startOAuth({ provider: "google", origin, locale: "en", from: "login", next, env });
        if (!started.ok) throw new Error("expected the provider to be configured");
        const url = new URL(started.location);
        nonce = url.searchParams.get("nonce")!;
        return { state: url.searchParams.get("state")!, cookie: started.cookie, started };
      },
    };
  }

  beforeEach(async () => {
    clearJwksCache();
    await cleanup();
  });

  it("signs a new person in end to end and sends them to onboarding", async () => {
    const provider = fakeProvider();
    const { state, cookie } = provider.begin();
    expect(cookie.name).toBe(OAUTH_COOKIE);
    const result = await finishOAuth({ provider: "google", origin, env, params: { code: "auth-code", state }, cookieValue: cookie.value, context, countryCode: "AE", fetcher: provider.fetcher });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.location).toBe("/user/onboarding");
    const user = await db.user.findUniqueOrThrow({ where: { email: email("pipeline") }, include: { profile: true } });
    expect(user.profile).toMatchObject({ displayName: "Pipeline Person", locale: "en", countryCode: "AE" });
    expect(await db.session.count({ where: { tokenHash: hashSessionToken(result.session.token) } })).toBe(1);
  });

  it("sends a returning person to the page they asked for", async () => {
    const first = fakeProvider();
    const a = first.begin();
    await finishOAuth({ provider: "google", origin, env, params: { code: "c", state: a.state }, cookieValue: a.cookie.value, context, fetcher: first.fetcher });
    const second = fakeProvider();
    const b = second.begin("/projects");
    const result = await finishOAuth({ provider: "google", origin, env, params: { code: "c", state: b.state }, cookieValue: b.cookie.value, context, fetcher: second.fetcher });
    expect(result).toMatchObject({ ok: true, created: false, location: "/projects" });
  });

  it("rejects a callback whose state does not match the browser's transaction", async () => {
    const provider = fakeProvider();
    const { cookie } = provider.begin();
    const result = await finishOAuth({ provider: "google", origin, env, params: { code: "c", state: "forged-state" }, cookieValue: cookie.value, context, fetcher: provider.fetcher });
    expect(result).toMatchObject({ ok: false, code: "failed" });
    expect(provider.fetcher).not.toHaveBeenCalled();
    expect(await db.user.count({ where: { email: email("pipeline") } })).toBe(0);
  });

  it("rejects a callback with no transaction cookie, a tampered one, or one from another provider", async () => {
    const provider = fakeProvider();
    const { state, cookie } = provider.begin();
    for (const cookieValue of [undefined, `${cookie.value}x`, cookie.value.replace(/^./, "A")]) {
      const result = await finishOAuth({ provider: "google", origin, env, params: { code: "c", state }, cookieValue, context, fetcher: provider.fetcher });
      expect(result).toMatchObject({ ok: false, code: "failed" });
    }
    const wrongProvider = await finishOAuth({ provider: "apple", origin, env: { ...env, APPLE_CLIENT_ID: "a", APPLE_TEAM_ID: "t", APPLE_KEY_ID: "k", APPLE_PRIVATE_KEY: "p" }, params: { code: "c", state }, cookieValue: cookie.value, context, fetcher: provider.fetcher });
    expect(wrongProvider).toMatchObject({ ok: false, code: "failed" });
    expect(provider.fetcher).not.toHaveBeenCalled();
  });

  it("maps the provider's cancel and error responses without recording a security failure for a cancel", async () => {
    const before = await codeFailures();
    const provider = fakeProvider();
    const a = provider.begin();
    expect(await finishOAuth({ provider: "google", origin, env, params: { error: "access_denied", state: a.state }, cookieValue: a.cookie.value, context, fetcher: provider.fetcher })).toMatchObject({
      ok: false,
      code: "denied",
      location: "/login?oauth_error=denied&oauth_provider=google&next=%2Fprojects",
    });
    expect(await codeFailures()).toBe(before);
    const b = provider.begin();
    expect(await finishOAuth({ provider: "google", origin, env, params: { error: "server_error", state: b.state }, cookieValue: b.cookie.value, context, fetcher: provider.fetcher })).toMatchObject({ ok: false, code: "failed" });
    expect(await codeFailures()).toBe(before + 1);
  });

  it("fails safely when the token endpoint errors or the ID token carries the wrong nonce", async () => {
    const down = fakeProvider({ tokenStatus: 500 });
    const a = down.begin();
    expect(await finishOAuth({ provider: "google", origin, env, params: { code: "c", state: a.state }, cookieValue: a.cookie.value, context, fetcher: down.fetcher })).toMatchObject({ ok: false, code: "failed" });
    const replay = fakeProvider({ claims: () => ({ nonce: "someone-elses-nonce" }) });
    const b = replay.begin();
    expect(await finishOAuth({ provider: "google", origin, env, params: { code: "c", state: b.state }, cookieValue: b.cookie.value, context, fetcher: replay.fetcher })).toMatchObject({ ok: false, code: "failed" });
    expect(await db.user.count({ where: { email: email("pipeline") } })).toBe(0);
  });

  it("reports the provider as unavailable when it is not configured", async () => {
    const started = startOAuth({ provider: "google", origin, locale: "en", from: "register", next: null, env: {} });
    expect(started).toMatchObject({ ok: false, location: "/register?oauth_error=unavailable&oauth_provider=google" });
  });

  it("surfaces a closed registration as its own error code", async () => {
    const provider = fakeProvider();
    const a = provider.begin();
    const result = await finishOAuth({ provider: "google", origin, env: { ...env, NODE_ENV: "production" }, params: { code: "c", state: a.state }, cookieValue: a.cookie.value, context, fetcher: provider.fetcher });
    expect(result).toMatchObject({ ok: false, code: "registration_closed" });
  });
});
