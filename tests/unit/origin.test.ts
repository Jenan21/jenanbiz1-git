import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { hasValidOrigin } from "@/lib/auth/request";

describe("hasValidOrigin", () => {
  it("accepts the public forwarded origin", () => {
    const request = new NextRequest("http://internal:3000/api/auth/login", {
      headers: {
        origin: "https://app.example.com",
        host: "internal:3000",
        "x-forwarded-host": "app.example.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(hasValidOrigin(request)).toBe(true);
  });

  it("rejects a cross-origin request", () => {
    const request = new NextRequest("https://app.example.com/api/auth/login", {
      headers: {
        origin: "https://attacker.example",
        host: "app.example.com",
      },
    });
    expect(hasValidOrigin(request)).toBe(false);
  });
});
