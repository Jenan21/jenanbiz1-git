import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl } from "@/lib/db-url";

describe("normalizeDatabaseUrl", () => {
  it("pins the verifying mode for the modes pg is about to weaken", () => {
    for (const mode of ["require", "prefer", "verify-ca"]) {
      const result = new URL(normalizeDatabaseUrl(`postgresql://u:p@db.example.com/app?sslmode=${mode}`));
      expect(result.searchParams.get("sslmode"), mode).toBe("verify-full");
    }
  });

  it("keeps credentials, host, database and the other parameters intact", () => {
    const result = new URL(
      normalizeDatabaseUrl("postgresql://app%40team:p%40ss%2Fw0rd@ep-x.c-13.us-east-1.aws.neon.tech/neondb?sslmode=require&schema=public"),
    );
    expect(result.username).toBe("app%40team");
    expect(result.password).toBe("p%40ss%2Fw0rd");
    expect(result.host).toBe("ep-x.c-13.us-east-1.aws.neon.tech");
    expect(result.pathname).toBe("/neondb");
    expect(result.searchParams.get("schema")).toBe("public");
  });

  it("leaves strong, disabled and explicit libpq-compatibility settings alone", () => {
    for (const url of [
      "postgresql://u:p@db.example.com/app?sslmode=verify-full",
      "postgresql://u:p@127.0.0.1:5432/app?schema=public",
      "postgresql://u:p@127.0.0.1:5432/app?sslmode=disable",
      "postgresql://u:p@db.example.com/app?sslmode=require&uselibpqcompat=true",
    ]) {
      expect(normalizeDatabaseUrl(url), url).toBe(url);
    }
  });

  it("ignores values that are not PostgreSQL URLs", () => {
    for (const value of ["not a url", "mysql://u:p@h/db?sslmode=require", ""]) {
      expect(normalizeDatabaseUrl(value), value).toBe(value);
    }
  });
});
