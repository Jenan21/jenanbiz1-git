export type RobotStatus = "ACTIVE" | "REVIEW" | "HIDDEN" | "PENDING";

export type RobotRecord = {
  id: string;
  name: string;
  intelligence: number;
  skill: number;
  experience: number;
  status: RobotStatus;
};

export type RobotDashboardSummary = {
  totalRobots: number;
  visibleRobots: RobotRecord[];
  hiddenRobots: number;
  averageIntelligence: number;
  dailyGeneration: number;
  approvalRate: number;
};

export type MissionSpec = {
  name: string;
  requiredScore: number;
};

export type MissionAssignment = {
  name: string;
  requiredScore: number;
  assignedRobots: string[];
  totalSkillGain: number;
};

export type RobotMissionDistribution = {
  missions: MissionAssignment[];
  totalSkillGain: number;
  readyRobots: number;
};

export function createRobotCandidate(input: {
  name: string;
  team: string;
  mission: string;
}) {
  const normalizedName = input.name.trim().replace(/\s+/g, " ");
  const normalizedTeam = input.team.trim().replace(/\s+/g, " ");
  const normalizedMission = input.mission.trim().replace(/\s+/g, " ");
  const slugBase = normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "robot";

  return {
    name: normalizedName,
    team: normalizedTeam,
    slugBase,
    intelligence: 0,
    skill: 0,
    experience: 0,
    status: "REVIEW" as const,
    isVisible: false,
    notes: `Mission: ${normalizedMission}`,
    taskTitle: normalizedMission,
  };
}

export function buildRobotMissionDistribution(
  robots: RobotRecord[],
  missions: MissionSpec[],
): RobotMissionDistribution {
  const activeRobots = robots
    .filter((robot) => robot.status !== "HIDDEN")
    .sort((a, b) => b.intelligence - a.intelligence);

  const missionAssignments = missions.map((mission) => {
    const assignedRobots = activeRobots
      .filter((robot) => robot.intelligence >= mission.requiredScore)
      .slice(0, 3)
      .map((robot) => robot.name);

    return {
      name: mission.name,
      requiredScore: mission.requiredScore,
      assignedRobots,
      totalSkillGain: activeRobots
        .filter((robot) => robot.intelligence >= mission.requiredScore)
        .slice(0, 3)
        .reduce((sum, robot) => sum + robot.skill, 0),
    };
  });

  const totalSkillGain = missionAssignments.reduce((sum, mission) => sum + mission.totalSkillGain, 0);
  const readyRobots = activeRobots.filter((robot) => robot.intelligence >= 85).length;

  return {
    missions: missionAssignments,
    totalSkillGain,
    readyRobots,
  };
}

export function summarizeRobotMetrics(robots: RobotRecord[]): RobotDashboardSummary {
  const visibleRobots = robots
    .filter((r) => r.status === "ACTIVE")
    .sort((a, b) => b.intelligence - a.intelligence);
  const reviewRobots = robots.filter((r) => r.status === "REVIEW");
  const hiddenRobots = robots.filter((r) => r.status === "HIDDEN").length;
  const candidatePool = [...visibleRobots, ...reviewRobots];
  const averageIntelligence = candidatePool.length
    ? Math.round(candidatePool.reduce((sum, r) => sum + r.intelligence, 0) / candidatePool.length)
    : 0;
  const approvalRate = candidatePool.length
    ? Math.round((visibleRobots.length / candidatePool.length) * 100)
    : 0;

  return {
    totalRobots: robots.length,
    visibleRobots,
    hiddenRobots,
    averageIntelligence,
    dailyGeneration: 1000,
    approvalRate,
  };
}
