import { describe, expect, it } from "vitest";

import { OrganizationMemberStatus, SystemRole } from "@/generated/prisma/client";
import { hasPermission, memberHasPermission, memberUserView, ORGANIZATION_PERMISSIONS } from "@/lib/auth/authorization";
import { assertMinorAmount, MAX_MINOR_AMOUNT } from "@/lib/software/money-limits";

const financeRole = { permissions: [{ permission: { key: ORGANIZATION_PERMISSIONS.financeRead } }] };

describe("member list visibility", () => {
  // A row as the database could hand it over if a query selected too much.
  const leakyRow = {
    id: "user-1",
    email: "person@example.test",
    profile: { displayName: "Person", phone: "+966500000000", city: "Riyadh" },
    systemRole: "ADMIN",
    status: "ACTIVE",
    passwordHash: "argon2id$secret",
  };

  it("shows a colleague by name only and never carries phone, role, status or hash", () => {
    const view = memberUserView(leakyRow, { seesEmails: false, userId: "someone-else" });
    expect(view).toEqual({ id: "user-1", profile: { displayName: "Person" } });
    expect(JSON.stringify(view)).not.toMatch(/person@example|966500|ADMIN|argon2id|Riyadh/);
  });

  it("adds the address for the owner of the list and for the person themself", () => {
    expect(memberUserView(leakyRow, { seesEmails: true, userId: "owner" })).toEqual({ id: "user-1", email: "person@example.test", profile: { displayName: "Person" } });
    expect(memberUserView(leakyRow, { seesEmails: false, userId: "user-1" })).toMatchObject({ email: "person@example.test" });
    expect(JSON.stringify(memberUserView(leakyRow, { seesEmails: true, userId: "owner" }))).not.toMatch(/966500|ADMIN|argon2id|Riyadh/);
  });

  it("keeps a person without a profile representable", () => {
    expect(memberUserView({ id: "user-2", email: "bare@example.test", profile: null }, { seesEmails: false, userId: "x" })).toEqual({ id: "user-2", profile: null });
  });
});

describe("organization permissions", () => {
  it("lets only ACTIVE owners and ACTIVE roles with the permission through", () => {
    expect(memberHasPermission({ isOwner: true, role: null, status: OrganizationMemberStatus.ACTIVE }, ORGANIZATION_PERMISSIONS.financeRead)).toBe(true);
    expect(memberHasPermission({ isOwner: false, role: financeRole, status: OrganizationMemberStatus.ACTIVE }, ORGANIZATION_PERMISSIONS.financeRead)).toBe(true);
    expect(memberHasPermission({ isOwner: false, role: financeRole, status: OrganizationMemberStatus.ACTIVE }, ORGANIZATION_PERMISSIONS.financeWrite)).toBe(false);
    expect(memberHasPermission({ isOwner: false, role: null, status: OrganizationMemberStatus.ACTIVE }, ORGANIZATION_PERMISSIONS.financeRead)).toBe(false);
  });

  it("refuses invited and suspended members even when they own or hold the role", () => {
    for (const status of [OrganizationMemberStatus.INVITED, OrganizationMemberStatus.SUSPENDED]) {
      expect(memberHasPermission({ isOwner: true, role: null, status }, ORGANIZATION_PERMISSIONS.financeRead)).toBe(false);
      expect(memberHasPermission({ isOwner: false, role: financeRole, status }, ORGANIZATION_PERMISSIONS.financeRead)).toBe(false);
    }
  });

  it("hasPermission ignores memberships that are not ACTIVE and other organizations", () => {
    const user = (status: OrganizationMemberStatus, organizationId = "org-1") => ({ systemRole: SystemRole.USER, memberships: [{ organizationId, status, role: financeRole }] });
    expect(hasPermission(user(OrganizationMemberStatus.ACTIVE), ORGANIZATION_PERMISSIONS.financeRead, "org-1")).toBe(true);
    expect(hasPermission(user(OrganizationMemberStatus.INVITED), ORGANIZATION_PERMISSIONS.financeRead, "org-1")).toBe(false);
    expect(hasPermission(user(OrganizationMemberStatus.SUSPENDED), ORGANIZATION_PERMISSIONS.financeRead)).toBe(false);
    expect(hasPermission(user(OrganizationMemberStatus.ACTIVE, "org-2"), ORGANIZATION_PERMISSIONS.financeRead, "org-1")).toBe(false);
    expect(hasPermission({ systemRole: SystemRole.ADMIN, memberships: [] }, ORGANIZATION_PERMISSIONS.financeRead, "org-1")).toBe(true);
  });
});

describe("money column limits", () => {
  it("accepts whole amounts up to the 32-bit column maximum and refuses everything else with a clear sentence", () => {
    expect(assertMinorAmount(0, "Total")).toBe(0);
    expect(assertMinorAmount(MAX_MINOR_AMOUNT, "Total")).toBe(MAX_MINOR_AMOUNT);
    expect(() => assertMinorAmount(MAX_MINOR_AMOUNT + 1, "Sales document total")).toThrow("Sales document total exceeds the supported maximum");
    expect(() => assertMinorAmount(-1, "Total")).toThrow("exceeds the supported maximum");
    expect(() => assertMinorAmount(1.5, "Total")).toThrow("exceeds the supported maximum");
    expect(() => assertMinorAmount(Number.NaN, "Total")).toThrow("exceeds the supported maximum");
  });
});
