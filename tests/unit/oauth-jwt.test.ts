import { createSign, generateKeyPairSync, verify as cryptoVerify } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearJwksCache,
  createAppleClientSecret,
  OAuthTokenError,
  verifyIdToken,
} from "@/lib/auth/oauth/jwt";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "key-1", alg: "RS256", use: "sig" };
const otherPair = generateKeyPairSync("rsa", { modulusLength: 2048 });

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const seconds = NOW / 1000;
const baseClaims = {
  iss: "https://accounts.google.com",
  aud: "client-123",
  sub: "subject-1",
  nonce: "nonce-1",
  iat: seconds - 10,
  exp: seconds + 3600,
  email: "person@example.test",
  email_verified: true,
};

function b64(value: object | string) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function makeToken(
  claims: Record<string, unknown> = baseClaims,
  options: { alg?: string; kid?: string; signWith?: typeof privateKey } = {},
) {
  const input = `${b64({ alg: options.alg ?? "RS256", kid: options.kid ?? "key-1", typ: "JWT" })}.${b64(claims)}`;
  const signature = createSign("RSA-SHA256").update(input).sign(options.signWith ?? privateKey);
  return `${input}.${signature.toString("base64url")}`;
}

function jwksFetcher(keys: object[] = [jwk]) {
  return vi.fn(async () => new Response(JSON.stringify({ keys }), { status: 200 })) as unknown as typeof fetch;
}

const verifyOptions = {
  jwksUri: "https://keys.example.test/certs",
  issuers: ["https://accounts.google.com", "accounts.google.com"],
  audience: "client-123",
  nonce: "nonce-1",
  now: NOW,
};

async function failureOf(token: string, overrides: Partial<typeof verifyOptions> & { fetcher?: typeof fetch } = {}) {
  try {
    await verifyIdToken(token, { ...verifyOptions, fetcher: jwksFetcher(), ...overrides });
  } catch (error) {
    return error instanceof OAuthTokenError ? error.code : `unexpected:${String(error)}`;
  }
  return "accepted";
}

describe("OAuth ID token verification", () => {
  beforeEach(() => clearJwksCache());

  it("accepts a correctly signed, current token and returns its claims", async () => {
    const claims = await verifyIdToken(makeToken(), { ...verifyOptions, fetcher: jwksFetcher() });
    expect(claims.sub).toBe("subject-1");
    expect(claims.email).toBe("person@example.test");
  });

  it("accepts the alternate Google issuer and an audience list containing the client", async () => {
    const token = makeToken({ ...baseClaims, iss: "accounts.google.com", aud: ["other", "client-123"] });
    await expect(verifyIdToken(token, { ...verifyOptions, fetcher: jwksFetcher() })).resolves.toMatchObject({ sub: "subject-1" });
  });

  it("rejects tokens that are not RS256, including alg none and HS256", async () => {
    expect(await failureOf(makeToken(baseClaims, { alg: "none" }))).toBe("UNSUPPORTED_ALGORITHM");
    expect(await failureOf(makeToken(baseClaims, { alg: "HS256" }))).toBe("UNSUPPORTED_ALGORITHM");
    expect(await failureOf(`${b64({ alg: "none" })}.${b64(baseClaims)}.`)).toBe("MALFORMED_TOKEN");
  });

  it("rejects a token signed by a different key or with tampered claims", async () => {
    expect(await failureOf(makeToken(baseClaims, { signWith: otherPair.privateKey }))).toBe("BAD_SIGNATURE");
    const [header, , signature] = makeToken().split(".");
    expect(await failureOf(`${header}.${b64({ ...baseClaims, sub: "someone-else" })}.${signature}`)).toBe("BAD_SIGNATURE");
  });

  it("rejects a key id the provider does not publish, after refreshing the key set once", async () => {
    const fetcher = jwksFetcher();
    expect(await failureOf(makeToken(baseClaims, { kid: "missing" }), { fetcher })).toBe("UNKNOWN_KEY");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects wrong issuer, audience, nonce, expired and not-yet-valid tokens", async () => {
    expect(await failureOf(makeToken({ ...baseClaims, iss: "https://evil.example.test" }))).toBe("BAD_ISSUER");
    expect(await failureOf(makeToken({ ...baseClaims, aud: "another-client" }))).toBe("BAD_AUDIENCE");
    expect(await failureOf(makeToken({ ...baseClaims, nonce: "replayed" }))).toBe("BAD_NONCE");
    expect(await failureOf(makeToken({ ...baseClaims, nonce: undefined }))).toBe("BAD_NONCE");
    expect(await failureOf(makeToken({ ...baseClaims, exp: seconds - 3600 }))).toBe("EXPIRED");
    expect(await failureOf(makeToken({ ...baseClaims, iat: seconds + 3600 }))).toBe("NOT_YET_VALID");
    expect(await failureOf(makeToken({ ...baseClaims, sub: "" }))).toBe("MALFORMED_TOKEN");
  });

  it("reports unavailable keys instead of trusting an unverifiable token", async () => {
    const down = vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    expect(await failureOf(makeToken(), { fetcher: down })).toBe("KEYS_UNAVAILABLE");
  });

  it("reuses the cached key set between verifications", async () => {
    const fetcher = jwksFetcher();
    await verifyIdToken(makeToken(), { ...verifyOptions, fetcher });
    await verifyIdToken(makeToken(), { ...verifyOptions, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("Sign in with Apple client secret", () => {
  it("is an ES256 JWT carrying the team, key and services identifiers", () => {
    const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const secret = createAppleClientSecret({ teamId: "TEAM123456", keyId: "KEY1234567", clientId: "com.example.web", privateKey: pem, now: NOW });
    const [header, payload, signature] = secret.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567", typ: "JWT" });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      iss: "TEAM123456",
      iat: seconds,
      exp: seconds + 300,
      aud: "https://appleid.apple.com",
      sub: "com.example.web",
    });
    const valid = cryptoVerify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: pair.publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    );
    expect(valid).toBe(true);
  });
});
