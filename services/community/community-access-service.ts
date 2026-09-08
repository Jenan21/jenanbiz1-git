import { CommunityAccessStatus, CommunitySocialPlatform } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { listPlatformSocialLinks } from "@/services/platform/platform-social-link-service";

const platforms = [
  CommunitySocialPlatform.FACEBOOK,
  CommunitySocialPlatform.INSTAGRAM,
  CommunitySocialPlatform.TIKTOK,
  CommunitySocialPlatform.YOUTUBE,
  CommunitySocialPlatform.SNAPCHAT,
  CommunitySocialPlatform.X,
] as const;

export class CommunityAccessError extends Error {}

export async function listCommunityPlatforms() {
  const links = await listPlatformSocialLinks();
  return platforms.map((key) => ({ key, url: links.find((link) => link.platform === key)?.url ?? null }));
}

export async function getCommunityAccess(userId: string) {
  const grants = await db.communityAccessGrant.findMany({
    where: { userId, status: CommunityAccessStatus.ACTIVE },
    select: { platform: true, grantedAt: true },
    orderBy: { grantedAt: "asc" },
  });
  return {
    hasAccess: grants.length > 0,
    grants: grants.map((grant) => ({ platform: grant.platform, grantedAt: grant.grantedAt.toISOString() })),
  };
}

export async function grantCommunityAccess(userId: string, platform: CommunitySocialPlatform) {
  if (!(await listCommunityPlatforms()).find((item) => item.key === platform)?.url)
    throw new CommunityAccessError("This community channel is not configured");
  const grant = await db.communityAccessGrant.upsert({
    where: { userId_platform: { userId, platform } },
    update: { status: CommunityAccessStatus.ACTIVE, grantedAt: new Date(), revokedAt: null },
    create: { userId, platform },
  });
  await db.auditLog.create({
    data: {
      actorId: userId,
      action: "community.access.granted",
      entityType: "CommunityAccessGrant",
      entityId: grant.id,
      metadata: { platform },
    },
  });
  return getCommunityAccess(userId);
}

export async function revokeCommunityAccess(userId: string, platform: CommunitySocialPlatform) {
  const result = await db.communityAccessGrant.updateMany({
    where: { userId, platform, status: CommunityAccessStatus.ACTIVE },
    data: { status: CommunityAccessStatus.REVOKED, revokedAt: new Date() },
  });
  if (result.count) {
    await db.auditLog.create({
      data: {
        actorId: userId,
        action: "community.access.revoked",
        entityType: "CommunityAccessGrant",
        metadata: { platform },
      },
    });
  }
  return getCommunityAccess(userId);
}