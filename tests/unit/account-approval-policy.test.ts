import { describe, expect, it } from "vitest";
import { accountApprovalRequired } from "@/lib/auth/account-approval-policy";

describe("account approval policy", () => {
  it("is off for a private site and for development", () => {
    expect(accountApprovalRequired({})).toBe(false);
    expect(accountApprovalRequired({ NODE_ENV: "production" })).toBe(false);
    expect(accountApprovalRequired({ NODE_ENV: "production", PUBLIC_LAUNCH: "pending" })).toBe(false);
    expect(accountApprovalRequired({ NODE_ENV: "development", PUBLIC_LAUNCH: "approved" })).toBe(false);
  });

  it("turns on by itself once the production site is public", () => {
    expect(accountApprovalRequired({ NODE_ENV: "production", PUBLIC_LAUNCH: "approved" })).toBe(true);
    expect(accountApprovalRequired({ NODE_ENV: "production", PUBLIC_LAUNCH: " approved " })).toBe(true);
  });

  it("lets the owner decide explicitly in either direction", () => {
    expect(accountApprovalRequired({ REQUIRE_ACCOUNT_APPROVAL: "true" })).toBe(true);
    expect(accountApprovalRequired({ REQUIRE_ACCOUNT_APPROVAL: " TRUE " })).toBe(true);
    expect(accountApprovalRequired({ NODE_ENV: "production", PUBLIC_LAUNCH: "approved", REQUIRE_ACCOUNT_APPROVAL: "false" })).toBe(false);
  });
});
