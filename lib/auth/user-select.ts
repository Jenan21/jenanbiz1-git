export const publicUserSelect = {
  id: true,
  profile: { select: { displayName: true } },
} as const;

export const collaboratorUserSelect = {
  ...publicUserSelect,
  email: true,
} as const;
