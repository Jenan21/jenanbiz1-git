import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { cleanE2EIdentities, createE2ESession, queryE2E, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;

test.describe.serial("academy approved content library", () => {
  test.setTimeout(240_000);
  const resourceIds: string[] = [];
  const questionIds: string[] = [];

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EAdmin();
    await seedE2EUser();
  });

  test.afterAll(async () => {
    if (questionIds.length) await queryE2E('DELETE FROM "AcademyExamQuestion" WHERE id = ANY($1::text[])', [questionIds]);
    if (resourceIds.length) await queryE2E('DELETE FROM "AcademyResource" WHERE id = ANY($1::text[])', [resourceIds]);
    await cleanE2EIdentities();
  });

  test("creates, approves, searches, and renders sourced study content", async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminToken = await createE2ESession(e2eIdentity.admin.email);
    await adminContext.addCookies([{ name: "jenan_session", value: adminToken, url: origin }]);
    const slug = `e2e-study-${randomUUID()}`;
    const created = await adminContext.request.post("/api/academy/library", {
      headers: { origin },
      data: {
        action: "createResource",
        authorName: "E2E Research Desk",
        category: "Operations",
        content: { body: "Verified academy study content." },
        kind: "STUDY",
        references: [{ title: "Verified reference", url: "https://example.com/reference", source: "Example Registry" }],
        slug,
        sourceName: "Example Registry",
        sourcePublishedAt: "2026-09-01T00:00:00.000Z",
        sourceUrl: "https://example.com/source",
        summary: "Approved study summary",
        title: "E2E Verified Academy Study",
      },
    });
    expect(created.status()).toBe(201);
    const resourceId = (await created.json()).result.id as string;
    resourceIds.push(resourceId);
    const approved = await adminContext.request.post("/api/academy/library", { headers: { origin }, data: { action: "reviewResource", resourceId, approvalState: "APPROVED" } });
    expect(approved.status()).toBe(200);
    await adminContext.close();

    const userContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const userToken = await createE2ESession(e2eIdentity.user.email);
    await userContext.addCookies([{ name: "jenan_session", value: userToken, url: origin }, { name: "locale", value: "en", url: origin }]);
    const payload = await (await userContext.request.get("/api/academy/library?kind=STUDY&query=Verified")).json();
    expect(payload.resources).toHaveLength(1);
    const page = await userContext.newPage();
    expect((await page.goto(`/academy/studies?resource=${slug}`, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "E2E Verified Academy Study" })).toBeVisible();
    await expect(page.locator(".academy-resource-catalog")).toBeVisible();
    await page.getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(new RegExp(`/academy/study/sample\\?resource=${slug}`));
    await expect(page.getByText("Example Registry", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Verified academy study content.")).toBeVisible();
    const saved = await userContext.request.post("/api/academy/engagement", { headers: { origin }, data: { resourceId, status: "SAVED" } });
    expect(saved.status()).toBe(200);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".academy-resource-actions")).toHaveAttribute("data-academy-engagement", "SAVED");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await userContext.close();
  });

  test("runs a server-graded lesson, assessment, result, and certificate journey", async ({ browser }) => {
    const course = (await queryE2E<{ id: string }>('SELECT id FROM "AcademyCourse" ORDER BY "createdAt" ASC LIMIT 1', [])).rows[0];
    expect(course).toBeTruthy();
    const lessons = (await queryE2E<{ id: string }>('SELECT id FROM "AcademyLesson" WHERE "courseId" = $1 ORDER BY sequence', [course!.id])).rows;
    const exams = (await queryE2E<{ id: string }>('SELECT id FROM "AcademyExam" WHERE "courseId" = $1 ORDER BY "createdAt"', [course!.id])).rows;
    expect(lessons.length).toBeGreaterThan(0);
    expect(exams.length).toBeGreaterThan(0);

    const adminContext = await browser.newContext();
    const adminToken = await createE2ESession(e2eIdentity.admin.email);
    await adminContext.addCookies([{ name: "jenan_session", value: adminToken, url: origin }]);
    const correctAnswers: Array<{ examId: string; optionId: string; questionId: string }> = [];
    for (const [index, exam] of exams.entries()) {
      const response = await adminContext.request.post("/api/academy/library", { headers: { origin }, data: { action: "createExamQuestion", examId: exam.id, points: 2, prompt: `E2E verified question ${index + 1}`, options: [{ label: "Verified evidence", isCorrect: true }, { label: "Unsupported claim", isCorrect: false }] } });
      expect(response.status()).toBe(201);
      const question = (await response.json()).result as { id: string; options: Array<{ id: string; isCorrect: boolean }> };
      questionIds.push(question.id);
      correctAnswers.push({ examId: exam.id, questionId: question.id, optionId: question.options.find((option) => option.isCorrect)!.id });
    }
    await adminContext.close();

    const userContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const userToken = await createE2ESession(e2eIdentity.user.email);
    await userContext.addCookies([{ name: "jenan_session", value: userToken, url: origin }, { name: "locale", value: "en", url: origin }]);
    expect((await userContext.request.post("/api/academy/progress", { headers: { origin }, data: { action: "enroll", courseId: course!.id } })).status()).toBe(201);
    expect((await userContext.request.post("/api/academy/progress", { headers: { origin }, data: { action: "submitExam", examId: exams[0]!.id, score: 100 } })).status()).toBe(400);
    expect((await userContext.request.post("/api/academy/progress", { headers: { origin }, data: { action: "saveNote", lessonId: lessons[0]!.id, content: "E2E private learning note" } })).status()).toBe(200);
    for (const lesson of lessons) expect((await userContext.request.post("/api/academy/progress", { headers: { origin }, data: { action: "completeLesson", lessonId: lesson.id } })).status()).toBe(200);
    for (const answer of correctAnswers) expect((await userContext.request.post("/api/academy/progress", { headers: { origin }, data: { action: "submitExam", examId: answer.examId, answers: [{ questionId: answer.questionId, optionId: answer.optionId }] } })).status()).toBe(200);
    const progress = await (await userContext.request.get(`/api/academy/progress?courseId=${course!.id}`)).json();
    expect(progress.examAttempts.every((attempt: { score: number }) => attempt.score === 100)).toBe(true);
    expect(progress.lessonNotes[0]?.content).toBe("E2E private learning note");
    expect(progress.certificate?.id).toBeTruthy();
    expect(JSON.stringify(progress.examQuestions)).not.toContain("isCorrect");

    const page = await userContext.newPage();
    await page.goto("/academy/course/sample/lesson/1", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".academy-course-journey")).toHaveAttribute("data-academy-course-mode", "lesson");
    await expect(page.getByPlaceholder("Capture your learning notes...")).toHaveValue("E2E private learning note");
    await page.goto("/academy/course/sample/quiz", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".academy-quiz")).toContainText("PASSED");
    await page.goto("/academy/course/sample/result", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".academy-course-result")).toContainText("100%");
    await page.goto("/academy/certificates/sample", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".academy-certificate")).toContainText(progress.certificate.id);
    await expect(page.locator(".academy-course-journey")).toHaveAttribute("data-academy-outputs", "PRINT_PDF,SHARE_LINK");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await userContext.close();

    const publicContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const publicPage = await publicContext.newPage();
    expect((await publicPage.goto(`/academy/verify/${progress.certificate.id}`, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
    await expect(publicPage.locator(".academy-verification")).toHaveAttribute("data-certificate-state", "VALID");
    await expect(publicPage.locator(".academy-verification")).toContainText(progress.certificate.id);
    await expect(publicPage.locator(".academy-verification")).not.toContainText(e2eIdentity.user.email);
    expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await publicContext.close();
  });
});