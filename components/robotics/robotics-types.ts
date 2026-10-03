export type PublicRobot = {
  id: string;
  name: string;
  intelligence: number;
  skill: number;
  experience: number;
  updatedAt: string;
  academicProfile: {
    status: string;
    qualityScore: number;
    reliabilityScore: number;
    safetyScore: number;
    trustScore: number;
    lastVerifiedAt: string | null;
    operationalAt: string | null;
    primarySpecialization: { name: string; description: string | null; field: { name: string } } | null;
    skills: { level: string; skill: { name: string; description: string | null } }[];
    certifications: { status: string; awardedAt: string | null; expiresAt: string | null; certification: { name: string } }[];
    geographyProfiles: { proficiency: string; market: string | null; language: string | null; knowledgeFreshness: number; geographyNode: { name: string; type: string; code: string | null } }[];
  } | null;
};
export type RobotRecommendation = { robot: PublicRobot; score: number; reasons: string[]; gaps: string[]; budgetCompatibility: "UNAVAILABLE" | "NOT_PROVIDED" };
export type RobotRequest = { id: string; robotId: string; task: string; sector: string | null; location: string | null; environment: string | null; budgetMinor: number | null; status: string; createdAt: string; updatedAt: string; robot: { name: string } };
export type RoboticsPayload = { success: boolean; message?: string; robots: PublicRobot[]; recommendations: RobotRecommendation[]; requests: RobotRequest[]; executionAvailableToUser: false; pricingSourceConnected: false };