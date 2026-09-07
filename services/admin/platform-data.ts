export type DashboardApiResponse = {
  success: boolean;
  summary?: {
    totalRobots: number;
    visibleRobots: Array<{
      id: string;
      name: string;
      intelligence: number;
      skill: number;
      experience: number;
      status: string;
    }>;
    hiddenRobots: number;
    averageIntelligence: number;
    dailyGeneration: number;
    approvalRate: number;
  };
  overview?: {
    stats?: Array<{ label: string; value: string; detail: string }>;
    watchlist?: Array<{ name: string; score: number; status: string }>;
    total?: string;
  };
  operations?: {
    stages?: Array<{ stage: string; count: string | number; detail: string }>;
    activeMissions?: Array<{ title: string; owner: string; zone: string }>;
    missions?: Array<{ title: string; owner: string; zone: string }>;
  };
  message?: string;
};

export async function getPlatformDashboardData() {
  const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
  if (!response.ok) {
    return {
      sourceState: "unavailable" as const,
      overview: null,
      operations: null,
    };
  }

  const data = (await response.json()) as DashboardApiResponse;
  if (!data.success) {
    return {
      sourceState: "unavailable" as const,
      overview: null,
      operations: null,
    };
  }

  return {
    sourceState: "connected" as const,
    overview: data.overview ?? null,
    operations: data.operations ?? null,
  };
}
