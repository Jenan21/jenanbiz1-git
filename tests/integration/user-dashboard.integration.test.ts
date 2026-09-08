import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getUserDashboard } from "@/services/dashboard/user-dashboard-service";
import { createProject } from "@/services/projects/project-service";
import { registerUser } from "@/services/auth/auth.service";

const email = "user.dashboard@example.test";

async function cleanDashboardUser() {
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;
  await db.project.deleteMany({ where: { createdById: user.id } });
  await db.auditLog.deleteMany({ where: { actorId: user.id } });
  await db.user.delete({ where: { id: user.id } });
}

describe.sequential("user dashboard integration", () => {
  beforeEach(cleanDashboardUser);
  afterAll(async () => {
    await cleanDashboardUser();
    await db.$disconnect();
  });

  it("summarizes only the authenticated user's real activity", async () => {
    const user = await registerUser({ displayName: "Dashboard User", email, password: "Correct-Horse-2026!", locale: "en", language: "en", countryCode: "SA" });
    await createProject({ name: "Dashboard Project", description: "An authenticated dashboard project." }, user.user.id);
    await db.notification.create({ data: { userId: user.user.id, type: "TEST", title: "Dashboard notification" } });

    const dashboard = await getUserDashboard(user.user.id);
    expect(dashboard.metrics.projects).toEqual({ total: 1, active: 0 });
    expect(dashboard.metrics.notifications.unread).toBe(1);
    expect(dashboard.metrics.learning).toEqual({ enrolled: 0, completed: 0 });
    expect(dashboard.recentActivity).toEqual(expect.arrayContaining([expect.objectContaining({ action: "project.created", entityType: "Project" })]));
  });
});