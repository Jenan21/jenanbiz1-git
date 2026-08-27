import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hasAcademyScope } from "@/services/academy/academy-access";

const suffix = crypto.randomUUID().slice(0, 8);
let academyId: string | undefined;
let userId: string | undefined;

afterAll(async () => {
  if (userId) await db.user.delete({ where: { id: userId } });
  if (academyId) await db.academy.delete({ where: { id: academyId } });
  await db.$disconnect();
});

describe("academy role scopes", () => {
  it("allows only the assigned academy scope while platform admins retain global access", async () => {
    const academy = await db.academy.create({ data: { name: `RBAC academy ${suffix}`, slug: `rbac-academy-${suffix}` } });
    academyId = academy.id;
    const managerRole = await db.academyRole.create({ data: { academyId: academy.id, name: "Workforce manager", key: `workforce-${suffix}`, scope: "WORKFORCE_MANAGER" } });
    const user = await db.user.create({ data: { email: `academy-${suffix}@example.test`, status: "ACTIVE", systemRole: "USER" } });
    userId = user.id;
    await db.academyStaffAssignment.create({ data: { academyRoleId: managerRole.id, userId: user.id } });

    expect(await hasAcademyScope({ userId: user.id, systemRole: "USER", academyId: academy.id, scope: "WORKFORCE_MANAGER" })).toBe(true);
    expect(await hasAcademyScope({ userId: user.id, systemRole: "USER", academyId: academy.id, scope: "CURRICULUM_MANAGER" })).toBe(false);
    expect(await hasAcademyScope({ userId: user.id, systemRole: "ADMIN", academyId: academy.id, scope: "CURRICULUM_MANAGER" })).toBe(true);
  });
});