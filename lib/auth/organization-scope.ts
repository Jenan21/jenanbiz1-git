export function ownedOrganizationRecordWhere(userId: string) {
  return {
    createdById: userId,
    OR: [
      { organizationId: null },
      { organization: { members: { some: { userId, status: "ACTIVE" as const, isOwner: true } } } },
    ],
  };
}
