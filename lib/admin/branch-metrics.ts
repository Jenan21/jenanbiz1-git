export interface BranchMetricsRecord {
  activeMembers: number;
  createdAt: string;
  memberCount: number;
  subscriptionCount: number;
}

export function summarizeBranchMetrics<T extends BranchMetricsRecord>(
  branches: readonly T[],
) {
  const totals = branches.reduce(
    (acc, branch) => {
      acc.members += branch.memberCount;
      acc.activeMembers += branch.activeMembers;
      acc.subscriptions += branch.subscriptionCount;
      return acc;
    },
    { members: 0, activeMembers: 0, subscriptions: 0 },
  );

  return {
    ...totals,
    branchCount: branches.length,
    newestBranch: branches[0],
  };
}

export function formatBranchDate(dateLike: string | undefined, locale: string) {
  if (!dateLike) return "—";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
