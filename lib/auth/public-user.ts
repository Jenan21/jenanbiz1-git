import type { Prisma } from "@/generated/prisma/client";

/**
 * What one user may see of another: a display name and an opaque id, nothing else.
 * Never `include` a `user`/`createdBy` relation wholesale in a response that other people can read; email, phone,
 * role and status belong to the account owner and to administrators only.
 */
export const publicUserSelect = {
  id: true,
  profile: { select: { displayName: true } },
} as const satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
