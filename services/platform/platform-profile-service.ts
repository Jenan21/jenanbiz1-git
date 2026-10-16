import { db } from "@/lib/db";
import {
  normalizePlatformProfile,
  platformProfileSchema,
  type PlatformProfile,
} from "@/lib/platform/platform-profile";
import { emptyPlatformProfile } from "@/lib/platform/platform-profile-empty";

const PROFILE_ID = "platform";

/** The stored profile, or null when it could not be read. An unset profile is the empty one, never a made-up one. */
export async function getPlatformProfile(): Promise<{ profile: PlatformProfile; updatedAt: Date | null } | null> {
  try {
    const row = await db.platformProfile.findUnique({ where: { id: PROFILE_ID } });
    if (!row) return { profile: emptyPlatformProfile, updatedAt: null };
    const parsed = platformProfileSchema.safeParse(row.content);
    return { profile: parsed.success ? parsed.data : emptyPlatformProfile, updatedAt: row.updatedAt };
  } catch (error) {
    console.error("platform profile read failed", error);
    return null;
  }
}

export async function savePlatformProfile(input: PlatformProfile, actorId: string) {
  const content = normalizePlatformProfile(input);
  const row = await db.platformProfile.upsert({
    where: { id: PROFILE_ID },
    create: { id: PROFILE_ID, content, updatedById: actorId },
    update: { content, updatedById: actorId },
  });
  await db.auditLog.create({
    data: {
      actorId,
      action: "platform.profile.saved",
      entityType: "PlatformProfile",
      entityId: PROFILE_ID,
      metadata: { achievements: content.achievements.length, emails: content.contacts.emails.length, phones: content.contacts.phones.length },
    },
  });
  return { profile: content, updatedAt: row.updatedAt };
}
