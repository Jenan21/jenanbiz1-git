import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("lists and marks a user's notification as read", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const email = `notifications-${Date.now()}@example.test`;
  const notificationId = `c${Date.now().toString(36).padStart(24, "0").slice(-24)}`;
  let userId: string | undefined;
  try {
    const registration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Notification User", countryCode: "SA", email, password: "StrongPass123!", locale: "en", language: "en" } });
    userId = (await registration.json()).user.id as string;
    await queryE2E('INSERT INTO "Notification" (id, "userId", type, title, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())', [notificationId, userId, "E2E", "E2E notification", "UNREAD"]);
    const listed = await page.request.get("/api/notifications");
    expect((await listed.json()).unreadCount).toBe(1);
    const read = await page.request.post("/api/notifications", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { notificationId } });
    expect(read.status()).toBe(200);
    expect((await page.request.get("/api/notifications")).status()).toBe(200);
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByLabel(/الإشعارات|Notifications/)).toBeVisible();
  } finally {
    await queryE2E('DELETE FROM "Notification" WHERE id = $1', [notificationId]);
    if (userId) await queryE2E('DELETE FROM "User" WHERE id = $1', [userId]);
  }
});