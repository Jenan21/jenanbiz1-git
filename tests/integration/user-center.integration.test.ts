import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getUserPayments, getUserReportIndex } from "@/services/account/user-center-service";
import {
  getHiddenInterfacePaths,
  restoreAllInterfacePaths,
  updateHiddenInterfacePaths,
} from "@/services/account/interface-visibility-service";

const suffix = crypto.randomUUID().slice(0, 8);
let userId: string | undefined;
let projectId: string | undefined;
let paymentId: string | undefined;
let preferenceUserId: string | undefined;

afterAll(async () => {
  if (paymentId) await db.payment.delete({ where: { id: paymentId } });
  if (projectId) await db.project.delete({ where: { id: projectId } });
  if (userId) {
    await db.auditLog.deleteMany({ where: { actorId: userId } });
    await db.user.delete({ where: { id: userId } });
  }
  if (preferenceUserId) {
    await db.auditLog.deleteMany({ where: { actorId: preferenceUserId } });
    await db.user.delete({ where: { id: preferenceUserId } });
  }
  await db.$disconnect();
});

describe("user center", () => {
  it("returns only persisted payments and reportable projects for the user", async () => {
    const user = await db.user.create({ data: { email: `user-center-${suffix}@example.test`, status: "ACTIVE", profile: { create: { displayName: "User center", locale: "en", language: "en" } } } });
    userId = user.id;
    const project = await db.project.create({ data: { createdById: user.id, name: `User center project ${suffix}`, slug: `user-center-project-${suffix}` } });
    projectId = project.id;
    const payment = await db.payment.create({ data: { payerUserId: user.id, amountMinor: 12_500, currency: "SAR", status: "SUCCEEDED", provider: "E2E", externalRef: `user-center-${suffix}`, paidAt: new Date() } });
    paymentId = payment.id;
    await db.auditLog.create({ data: { actorId: user.id, action: "user.center.test", entityType: "User", entityId: user.id } });

    const [payments, reports] = await Promise.all([getUserPayments(user.id), getUserReportIndex(user.id)]);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ id: payment.id, amountMinor: 12_500, currency: "SAR", status: "SUCCEEDED" });
    expect(reports.projects[0]?.id).toBe(project.id);
    expect(reports.activity.some((entry) => entry.action === "user.center.test")).toBe(true);
  });

  it("persists allowlisted visibility preferences per user and restores them", async () => {
    const user = await db.user.create({
      data: {
        email: `interface-preferences-${suffix}@example.test`,
        status: "ACTIVE",
        profile: { create: { displayName: "Interface preferences" } },
      },
    });
    preferenceUserId = user.id;

    expect(await getHiddenInterfacePaths(user.id)).toEqual([]);
    expect(await updateHiddenInterfacePaths({
      hidden: true,
      paths: ["/projects", "/software/files"],
      userId: user.id,
    })).toEqual(["/projects", "/software/files"]);
    expect(await getHiddenInterfacePaths(user.id)).toEqual(["/projects", "/software/files"]);
    expect(await updateHiddenInterfacePaths({
      hidden: false,
      paths: ["/projects"],
      userId: user.id,
    })).toEqual(["/software/files"]);
    await expect(updateHiddenInterfacePaths({
      hidden: true,
      paths: ["/user/interface"],
      userId: user.id,
    })).rejects.toThrow("Unknown interface visibility path");
    expect(await restoreAllInterfacePaths(user.id)).toEqual([]);
    expect(await getHiddenInterfacePaths(user.id)).toEqual([]);
  });
});