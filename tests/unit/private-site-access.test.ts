import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";

describe("private site access", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays disabled when no access credentials are configured", () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "");
    expect(proxy(new NextRequest("https://app.example.com")).status).toBe(200);
  });

  it("refuses a production deployment without the gate until the public launch is approved", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_ACCESS_USERNAME", "");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "");
    for (const approval of ["", "true", "yes", "approve"]) {
      vi.stubEnv("PUBLIC_LAUNCH", approval);
      expect(proxy(new NextRequest("https://app.example.com/login")).status, `PUBLIC_LAUNCH=${approval}`).toBe(503);
    }
    vi.stubEnv("PUBLIC_LAUNCH", "approved");
    expect(proxy(new NextRequest("https://app.example.com/login")).status).toBe(200);
  });

  it("keeps the gate in force in production even when the launch is approved", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_LAUNCH", "approved");
    vi.stubEnv("SITE_ACCESS_USERNAME", "jenanpro");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "private-password");
    expect(proxy(new NextRequest("https://app.example.com/register")).status).toBe(401);
  });

  it("fails closed when protection is only partially configured", () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "jenanpro");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "");
    expect(proxy(new NextRequest("https://app.example.com")).status).toBe(503);
  });

  it("challenges invalid credentials and accepts the configured pair", () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "jenanpro");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "private-password");
    const unauthorized = proxy(new NextRequest("https://app.example.com"));
    const authorized = proxy(new NextRequest("https://app.example.com", {
      headers: { authorization: `Basic ${btoa("jenanpro:private-password")}` },
    }));

    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("Jenan PRO Private Preview");
    expect(authorized.status).toBe(200);
  });
});

describe("private site access coverage", () => {
  const covered = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

  it("covers the public page, sign-in, registration, recovery, OAuth and the application", () => {
    for (const path of [
      "/",
      "/login",
      "/register",
      "/auth",
      "/auth/forgot",
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/forgot",
      "/api/auth/oauth/google/start",
      "/api/auth/oauth/apple/callback",
      "/api/platform/activity",
      "/api/metrics",
      "/dashboard",
      "/assets/jenan-pro-logo.jpg",
    ]) {
      expect(covered(path), `${path} must stay behind the private gate`).toBe(true);
    }
  });

  it("leaves only the health probes and framework assets open", () => {
    for (const path of [
      "/api/health/live",
      "/api/health/ready",
      "/_next/static/chunks/app.js",
      "/_next/image",
      "/favicon.ico",
      "/icon.png",
      "/apple-icon.png",
    ]) {
      expect(covered(path), `${path} is meant to be open`).toBe(false);
    }
  });
});
