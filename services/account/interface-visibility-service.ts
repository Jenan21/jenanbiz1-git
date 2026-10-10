import type { Prisma } from "@/generated/prisma/client";
import { PERSONALIZABLE_INTERFACE_PATHS, normalizeHiddenInterfacePaths } from "@/lib/account/interface-visibility";
import { db } from "@/lib/db";

export async function getHiddenInterfacePaths(userId: string) {
  const profile = await db.profile.findUnique({
    where: { userId },
    select: { hiddenInterfacePaths: true },
  });
  return normalizeHiddenInterfacePaths(profile?.hiddenInterfacePaths);
}

export async function updateHiddenInterfacePaths(input: {
  hidden: boolean;
  paths: string[];
  userId: string;
}) {
  const paths = [...new Set(input.paths)];
  if (paths.some((path) => !PERSONALIZABLE_INTERFACE_PATHS.has(path))) {
    throw new Error("Unknown interface visibility path");
  }

  return db.$transaction(async (transaction) => {
    const profile = await transaction.profile.findUnique({
      where: { userId: input.userId },
      select: { hiddenInterfacePaths: true },
    });
    const hiddenPaths = new Set(normalizeHiddenInterfacePaths(profile?.hiddenInterfacePaths));
    for (const path of paths) {
      if (input.hidden) hiddenPaths.add(path);
      else hiddenPaths.delete(path);
    }
    const nextPaths = [...hiddenPaths].sort();
    const updatedProfile = await transaction.profile.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        hiddenInterfacePaths: nextPaths as Prisma.InputJsonValue,
      },
      update: { hiddenInterfacePaths: nextPaths as Prisma.InputJsonValue },
      select: { id: true },
    });
    await transaction.auditLog.create({
      data: {
        actorId: input.userId,
        action: input.hidden ? "interface.items.hidden" : "interface.items.shown",
        entityType: "Profile",
        entityId: updatedProfile.id,
        metadata: {
          affectedPaths: paths,
          hiddenCount: nextPaths.length,
        } as Prisma.InputJsonValue,
      },
    });
    return nextPaths;
  });
}

export async function restoreAllInterfacePaths(userId: string) {
  return db.$transaction(async (transaction) => {
    const profile = await transaction.profile.upsert({
      where: { userId },
      create: {
        userId,
        hiddenInterfacePaths: [] as Prisma.InputJsonValue,
      },
      update: { hiddenInterfacePaths: [] as Prisma.InputJsonValue },
      select: { id: true },
    });
    await transaction.auditLog.create({
      data: {
        actorId: userId,
        action: "interface.items.restored",
        entityType: "Profile",
        entityId: profile.id,
      },
    });
    return [];
  });
}
