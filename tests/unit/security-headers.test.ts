import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { ENFORCED_CSP_DIRECTIVES, buildContentSecurityPolicy, createNonce } from "@/lib/security/csp";
import { securityHeaders } from "@/lib/security/headers";

const directive = (policy: string, name: string) =>
  policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));

describe("content security policy", () => {
  it("builds a fresh nonce per request", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("allows scripts only through the nonce, never inline or eval in production", () => {
    const policy = buildContentSecurityPolicy({ nonce: "abc123==" });
    const script = directive(policy, "script-src")!;
    expect(script).toContain("'nonce-abc123=='");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toMatch(/'unsafe-inline'|'unsafe-eval'/);
    expect(directive(policy, "default-src")).toBe("default-src 'self'");
    expect(directive(policy, "object-src")).toBe("object-src 'self' blob:");
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'self'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
    expect(directive(policy, "form-action")).toBe("form-action 'self'");
    expect(directive(policy, "report-uri")).toBe("report-uri /api/security/csp-report");
  });

  it("only the development policy may evaluate code", () => {
    expect(directive(buildContentSecurityPolicy({ nonce: "n", development: true }), "script-src")).toContain("'unsafe-eval'");
    expect(directive(buildContentSecurityPolicy({ nonce: "n" }), "script-src")).not.toContain("'unsafe-eval'");
  });

  it("allows map images and only Sentry ingestion for external connections", () => {
    const policy = buildContentSecurityPolicy({ nonce: "n", mapTileUrl: "https://tiles.example.com/{z}/{x}/{y}.png" });
    const images = directive(policy, "img-src")!;
    expect(images).toContain("https://tiles.example.com");
    expect(images).toContain("https://*.tile.openstreetmap.org");
    expect(directive(policy, "connect-src")).toBe("connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io");
    expect(directive(buildContentSecurityPolicy({ nonce: "n", mapTileUrl: "garbage" }), "img-src")).not.toContain("garbage");
  });
});

describe("response headers", () => {
  const byKey = new Map(securityHeaders.map((header) => [header.key, header.value]));

  it("sets the baseline hardening headers", () => {
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(byKey.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(byKey.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(byKey.get("Strict-Transport-Security")).toMatch(/^max-age=\d{8,}/);
    expect(byKey.get("Permissions-Policy")).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
  });

  it("is applied to every path together with the enforced framing directives", async () => {
    const rules = await nextConfig.headers!();
    const everyPath = rules.filter((rule) => rule.source === "/:path*");
    expect(everyPath).toHaveLength(1);
    const keys = everyPath[0].headers.map((header) => header.key);
    for (const header of securityHeaders) expect(keys).toContain(header.key);
    const csp = everyPath[0].headers.find((header) => header.key === "Content-Security-Policy")!.value;
    for (const part of ENFORCED_CSP_DIRECTIVES) expect(csp).toContain(part);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
  });

  it("caches only the versioned world-map and report-banner assets for good, and nothing else", async () => {
    const rules = await nextConfig.headers!();
    const cached = rules.filter((rule) => rule.headers.some((header) => header.key === "Cache-Control" && /immutable/.test(header.value)));
    expect(cached.map((rule) => rule.source)).toEqual(["/assets/gateway-world.v1.svg", "/assets/analysis/city-lights.v1.svg"]);
  });

  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
