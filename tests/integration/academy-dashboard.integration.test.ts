import { afterAll, describe, expect, it } from "vitest";
import { getAcademyDashboard } from "@/lib/academy/academy-dashboard";
import { db } from "@/lib/db";

describe("academy dashboard", () => {
  it("reports the seeded academy registry and AI-dependent lab boundary", async () => {
    const dashboard = await getAcademyDashboard();

    expect(dashboard.courses).toBeGreaterThanOrEqual(18);
    expect(dashboard.exams).toBeGreaterThanOrEqual(36);
    expect(dashboard.certifications).toBeGreaterThanOrEqual(18);
    expect(dashboard.labsAwaitingProvider).toBeGreaterThanOrEqual(1);
    expect(dashboard.programs).toBeGreaterThanOrEqual(18);
    expect(dashboard.curriculumVersions).toBeGreaterThanOrEqual(18);
    expect(dashboard.academyRoles).toBeGreaterThanOrEqual(9);
    expect(dashboard.configuredQueues).toBeGreaterThanOrEqual(5);
  });
});

afterAll(async () => {
  await db.$disconnect();
});