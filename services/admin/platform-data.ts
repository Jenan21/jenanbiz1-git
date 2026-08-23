import { getOperationsData, getOverviewData } from "@/services/admin/mock-data";

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
  overview?: ReturnType<typeof getOverviewData>;
  operations?: ReturnType<typeof getOperationsData>;
  message?: string;
};

export async function getPlatformDashboardData(lang: "ar" | "en") {
  try {
    const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Dashboard API unavailable");
    }

    const data = (await response.json()) as DashboardApiResponse;

    if (data.overview) {
      return {
        overview: data.overview,
        operations: data.operations ?? getOperationsData(lang),
      };
    }

    if (data.summary) {
      const fallbackOverview = getOverviewData(lang);
      const fallbackOperations = getOperationsData(lang);
      const visibleCount = data.summary.visibleRobots.length;
      const totalLabel = data.summary.totalRobots.toLocaleString(lang === "ar" ? "ar-SA" : "en-US");

      return {
        overview: {
          ...fallbackOverview,
          total: totalLabel,
          stats: [
            {
              label: lang === "ar" ? "الروبوتات المرئية" : "Visible robots",
              value: String(visibleCount),
              detail: lang === "ar" ? "الأعلى تصنيفاً" : "Top-ranked active",
            },
            {
              label: lang === "ar" ? "متوسط الذكاء" : "Average intelligence",
              value: `${data.summary.averageIntelligence}%`,
              detail: lang === "ar" ? "نتيجة المنظومة" : "system-wide score",
            },
            {
              label: lang === "ar" ? "التوليد اليومي" : "Daily generation",
              value: `+${data.summary.dailyGeneration}`,
              detail: lang === "ar" ? "روبوت جديد / 24 ساعة" : "new robots / 24h",
            },
            {
              label: lang === "ar" ? "معدل الموافقة" : "Approval rate",
              value: `${data.summary.approvalRate}%`,
              detail: lang === "ar" ? "كفاءة القرار" : "decision efficiency",
            },
          ],
          watchlist: data.summary.visibleRobots.slice(0, 4).map((robot, index) => ({
            name: robot.name,
            score: robot.intelligence,
            status: lang === "ar" ? (index < 3 ? "جاهز" : "مراجعة") : (index < 3 ? "Ready" : "Review"),
          })),
        },
        operations: fallbackOperations,
      };
    }

    const fallbackOverview = getOverviewData(lang);
    const fallbackOperations = getOperationsData(lang);
    return {
      overview: fallbackOverview,
      operations: fallbackOperations,
    };
  } catch {
    const fallbackOverview = getOverviewData(lang);
    const fallbackOperations = getOperationsData(lang);
    return { overview: fallbackOverview, operations: fallbackOperations };
  }
}
