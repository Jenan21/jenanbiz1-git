export type CommitteeRecord = {
  robotName: string;
  reviewer: string;
  score: number;
  verdict: "APPROVE" | "DEFER" | "REJECT";
  notes?: string;
};

export type WorkflowTaskRecord = {
  title: string;
  robotName: string;
  status: "DRAFT" | "ACTIVE" | "PENDING_APPROVAL" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

export function buildCommitteeSummary(records: CommitteeRecord[]) {
  const averageScore = records.length
    ? Math.round(records.reduce((sum, item) => sum + item.score, 0) / records.length)
    : 0;

  const approvals = records.filter((item) => item.verdict === "APPROVE").length;
  const approvalRate = records.length ? Math.round((approvals / records.length) * 100) : 0;

  return {
    averageScore,
    approvalRate,
    members: records.map((record) => ({
      name: record.robotName,
      reviewer: record.reviewer,
      score: record.score,
      verdict: record.verdict,
      notes: record.notes ?? "No notes",
    })),
  };
}

export function buildDecisionQueue(records: WorkflowTaskRecord[]) {
  const ordered = [...records].sort((a, b) => {
    const priorityWeight = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    const statusWeight = {
      ACTIVE: 0,
      IN_PROGRESS: 1,
      PENDING_APPROVAL: 2,
      DRAFT: 3,
      COMPLETED: 4,
      CANCELLED: 5,
    };

    return (
      (priorityWeight[b.priority] ?? 0) - (priorityWeight[a.priority] ?? 0) ||
      (statusWeight[a.status] ?? 99) - (statusWeight[b.status] ?? 99)
    );
  });

  return ordered.map((record) => ({
    title: record.title,
    robotName: record.robotName,
    status: record.status,
    priority: record.priority,
  }));
}
