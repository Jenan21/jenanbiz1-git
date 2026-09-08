import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

type SocialLink = { url: string; isActive: boolean };

test("manages a JenanBIZ social link and shows community access in the member account", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const suffix = Date.now();
  let userId: string | undefined;
  let originalLink: SocialLink | undefined;
  try {
    originalLink = (await queryE2E<SocialLink>('SELECT url, "isActive" FROM "PlatformSocialLink" WHERE platform = $1', ["FACEBOOK"])).rows[0];
    await queryE2E('DELETE FROM "PlatformSocialLink" WHERE platform = $1', ["FACEBOOK"]);
    const registration = await page.request.post("/api/auth/register", {
      headers: { origin: baseURL },
      data: { displayName: "Community Administrator", countryCode: "SA", email: `community-admin-${suffix}@example.test`, password: "StrongPass123!", locale: "en", language: "en" },
    });
    expect(registration.status()).toBe(201);
    userId = (await registration.json()).user.id as string;
    await queryE2E('UPDATE "User" SET "systemRole" = $2 WHERE id = $1', [userId, "ADMIN"]);

    const saved = await page.request.post("/api/admin/social-links", {
      headers: { origin: baseURL, "Content-Type": "application/json" },
      data: { action: "save", platform: "FACEBOOK", url: "https://www.facebook.com/jenanbiz", isActive: true },
    });
    expect(saved.status(), await saved.text()).toBe(200);
    expect((await saved.json()).links).toEqual(expect.arrayContaining([expect.objectContaining({ platform: "FACEBOOK", url: "https://www.facebook.com/jenanbiz", isActive: true })]));

    const publicLinks = await page.request.get("/api/platform/social-links");
    expect(publicLinks.status()).toBe(200);
    expect((await publicLinks.json()).links).toEqual(expect.arrayContaining([expect.objectContaining({ platform: "FACEBOOK", url: "https://www.facebook.com/jenanbiz" })]));

    await queryE2E('UPDATE "User" SET "systemRole" = $2 WHERE id = $1', [userId, "USER"]);
    const granted = await page.request.post("/api/community-access", {
      headers: { origin: baseURL, "Content-Type": "application/json" },
      data: { action: "grant", platform: "FACEBOOK", acknowledged: true },
    });
    expect(granted.status(), await granted.text()).toBe(200);
    expect((await granted.json()).hasAccess).toBe(true);

    const account = await page.request.get("/api/account/overview");
    expect(account.status()).toBe(200);
    expect((await account.json()).overview.communityAccess).toMatchObject({ hasAccess: true, grants: [{ platform: "FACEBOOK" }] });
  } finally {
    if (userId) await queryE2E('DELETE FROM "User" WHERE id = $1', [userId]);
    await queryE2E('DELETE FROM "PlatformSocialLink" WHERE platform = $1', ["FACEBOOK"]);
    if (originalLink) {
      await queryE2E('INSERT INTO "PlatformSocialLink" (id, platform, url, "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())', [`c${suffix.toString(36).padStart(24, "0").slice(-24)}`, "FACEBOOK", originalLink.url, originalLink.isActive]);
    }
  }
});