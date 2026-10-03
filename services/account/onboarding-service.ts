import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export async function completeOnboarding(
  input: {
    accountType: "INDIVIDUAL" | "ORGANIZATION";
    city: string;
    countryCode: string;
    interests: string[];
  },
  userId: string,
) {
  return db.$transaction(async (transaction) => {
    const profile = await transaction.profile.upsert({
      where: { userId },
      update: {
        accountType: input.accountType,
        city: input.city.trim(),
        countryCode: input.countryCode.trim().toUpperCase(),
        interests: input.interests as Prisma.InputJsonValue,
        onboardedAt: new Date(),
      },
      create: {
        userId,
        accountType: input.accountType,
        city: input.city.trim(),
        countryCode: input.countryCode.trim().toUpperCase(),
        interests: input.interests as Prisma.InputJsonValue,
        onboardedAt: new Date(),
      },
    });
    await transaction.auditLog.create({
      data: {
        actorId: userId,
        action: "user.onboarding.completed",
        entityType: "Profile",
        entityId: profile.id,
        metadata: { accountType: input.accountType, interests: input.interests } as Prisma.InputJsonValue,
      },
    });
    return profile;
  });
}