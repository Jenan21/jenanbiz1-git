import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { hasValidOrigin } from "@/lib/auth/request";

describe("authentication request origin", () => {
  it("accepts the same request origin", () => {
    const request = new NextRequest("https://app.example.test/api/auth/login", {
      headers: {
        host: "app.example.test",
        origin: "https://app.example.test",
      },
      method: "POST",
    });
    expect(hasValidOrigin(request)).toBe(true);
  });

  it("rejects a forged forwarded host", () => {
    const request = new NextRequest("https://app.example.test/api/auth/login", {
      headers: {
        host: "app.example.test",
        origin: "https://malicious.example.test",
        "x-forwarded-host": "malicious.example.test",
        "x-forwarded-proto": "https",
      },
      method: "POST",
    });
    expect(hasValidOrigin(request)).toBe(false);
  });
});
