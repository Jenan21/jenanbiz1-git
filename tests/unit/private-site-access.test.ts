import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("private site access", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays disabled when no access credentials are configured", () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "");
    expect(proxy(new NextRequest("https://app.example.com")).status).toBe(200);
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
