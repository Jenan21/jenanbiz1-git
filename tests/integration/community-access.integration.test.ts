import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CommunitySocialPlatform } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CommunityAccessError, getCommunityAccess, grantCommunityAccess, listCommunityPlatforms, revokeCommunityAccess } from "@/services/community/community-access-service";
import { registerUser } from "@/services/auth/auth.service";

const email = "community.access@example.test";
let savedFacebookLink: { url: string; isActive: boolean } | null = null;

async function cleanTestUser() {
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    await db.auditLog.deleteMany({ where: { actorId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
}

describe.sequential("community access integration", () => {
  beforeEach(async () => {
    await cleanTestUser();
    savedFacebookLink = await db.platformSocialLink.findUnique({
      where: { platform: CommunitySocialPlatform.FACEBOOK },
      select: { url: true, isActive: true },
    });
    await db.platformSocialLink.deleteMany({
      where: { platform: CommunitySocialPlatform.FACEBOOK },
    });
  });
  afterAll(async () => {
    if (savedFacebookLink) {
      await db.platformSocialLink.upsert({
        where: { platform: CommunitySocialPlatform.FACEBOOK },
        update: savedFacebookLink,
        create: { platform: CommunitySocialPlatform.FACEBOOK, ...savedFacebookLink },
      });
    } else {
      await db.platformSocialLink.deleteMany({
        where: { platform: CommunitySocialPlatform.FACEBOOK },
      });
    }
    await cleanTestUser();
    await db.$disconnect();
  });

  it("only grants free access through a configured community channel", async () => {
    const user = await registerUser({ displayName: "Community User", email, password: "Correct-Horse-2026!", locale: "en", language: "en", countryCode: "SA" });
    expect(await getCommunityAccess(user.user.id)).toMatchObject({ hasAccess: false, grants: [] });
    await expect(grantCommunityAccess(user.user.id, CommunitySocialPlatform.FACEBOOK)).rejects.toBeInstanceOf(CommunityAccessError);

    await db.platformSocialLink.create({
      data: { platform: CommunitySocialPlatform.FACEBOOK, url: "https://www.facebook.com/jenanbiz", isActive: true },
    });
    expect((await listCommunityPlatforms()).find((platform) => platform.key === CommunitySocialPlatform.FACEBOOK)?.url).toBe("https://www.facebook.com/jenanbiz");
    expect(await grantCommunityAccess(user.user.id, CommunitySocialPlatform.FACEBOOK)).toMatchObject({ hasAccess: true, grants: [{ platform: CommunitySocialPlatform.FACEBOOK }] });
    expect(await revokeCommunityAccess(user.user.id, CommunitySocialPlatform.FACEBOOK)).toMatchObject({ hasAccess: false, grants: [] });
  });
});