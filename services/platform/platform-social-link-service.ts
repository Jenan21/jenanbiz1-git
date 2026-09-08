import { CommunitySocialPlatform } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export class PlatformSocialLinkError extends Error {}

export function validateSocialUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function listPlatformSocialLinks(includeInactive = false) {
  return db.platformSocialLink.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { platform: "asc" },
    select: { platform: true, url: true, isActive: true, updatedAt: true },
  });
}

export async function savePlatformSocialLink(input: { platform: CommunitySocialPlatform; url: string; isActive: boolean }, actorId: string) {
  const url = validateSocialUrl(input.url);
  if (!url) throw new PlatformSocialLinkError("A valid HTTPS URL is required");
  const link = await db.platformSocialLink.upsert({
    where: { platform: input.platform },
    update: { url, isActive: input.isActive },
    create: { platform: input.platform, url, isActive: input.isActive },
  });
  await db.auditLog.create({
    data: {
      actorId,
      action: "platform.social_link.saved",
      entityType: "PlatformSocialLink",
      entityId: link.id,
      metadata: { platform: link.platform, isActive: link.isActive },
    },
  });
  return link;
}

export async function removePlatformSocialLink(platform: CommunitySocialPlatform, actorId: string) {
  const link = await db.platformSocialLink.findUnique({ where: { platform } });
  if (!link) return false;
  await db.$transaction([
    db.platformSocialLink.delete({ where: { id: link.id } }),
    db.auditLog.create({
      data: {
        actorId,
        action: "platform.social_link.removed",
        entityType: "PlatformSocialLink",
        entityId: link.id,
        metadata: { platform },
      },
    }),
  ]);
  return true;
}