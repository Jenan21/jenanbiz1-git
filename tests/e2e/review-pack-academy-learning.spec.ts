import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("enrolls a learner and completes every lesson in an academy course", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const suffix = Date.now();
  const email = `academy-learner-${suffix}@example.test`;
  let userId: string | undefined;
  const academyId = `c${`${suffix}1`.padStart(24, "0")}`;
  const courseId = `c${`${suffix}2`.padStart(24, "0")}`;
  const firstLessonId = `c${`${suffix}3`.padStart(24, "0")}`;
  const secondLessonId = `c${`${suffix}4`.padStart(24, "0")}`;
  try {
    const registration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Academy Learner", countryCode: "SA", email, password: "StrongPass123!", locale: "en", language: "en" } });
    userId = (await registration.json()).user.id as string;
    await queryE2E('INSERT INTO "Academy" (id, name, slug, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())', [academyId, `E2E Academy ${suffix}`, `e2e-academy-${suffix}`]);
    await queryE2E('INSERT INTO "AcademyCourse" (id, "academyId", title, code, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())', [courseId, academyId, "E2E Learner Course", `E2E-${suffix}`]);
    await queryE2E('INSERT INTO "AcademyLesson" (id, "courseId", title, sequence, "createdAt", "updatedAt") VALUES ($1, $2, $3, 1, NOW(), NOW()), ($4, $2, $5, 2, NOW(), NOW())', [firstLessonId, courseId, "E2E lesson one", secondLessonId, "E2E lesson two"]);
    const enrollment = await page.request.post("/api/academy/progress", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "enroll", courseId } });
    expect(enrollment.status()).toBe(201);
    for (const lessonId of [firstLessonId, secondLessonId]) expect((await page.request.post("/api/academy/progress", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "completeLesson", lessonId } })).status()).toBe(200);
    const progress = await page.request.get(`/api/academy/progress?courseId=${courseId}`);
    const payload = await progress.json();
    expect(payload.enrollment.status).toBe("COMPLETED");
    expect(payload.completedLessonIds).toHaveLength(2);
    await page.goto(`/academy/courses/${courseId}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /Completed|مكتمل/ }).first()).toBeVisible();
  } finally {
    await queryE2E('DELETE FROM "Academy" WHERE id = $1', [academyId]);
    if (userId) await queryE2E('DELETE FROM "User" WHERE id = $1', [userId]);
  }
});