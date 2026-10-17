import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { RateLimitDecision } from "@/lib/rate-limit/contracts";
import { getRateLimitProvider } from "@/lib/rate-limit/auth-rate-limit";
import { clientAddress } from "@/lib/security/site-gate";

export type ProjectRateLimitAction = "create" | "assessment" | "financial" | "intelligence" | "risk" | "decision" | "membership" | "phase" | "start" | "geocode" | "status" | "save";

const policies: Record<ProjectRateLimitAction, { limit: number; windowMs: number }> = {
  create: { limit: 12, windowMs: 60_000 },
  assessment: { limit: 30, windowMs: 60_000 },
  financial: { limit: 20, windowMs: 60_000 },
  intelligence: { limit: 8, windowMs: 60_000 },
  risk: { limit: 30, windowMs: 60_000 },
  decision: { limit: 10, windowMs: 60_000 },
  membership: { limit: 15, windowMs: 60_000 },
  phase: { limit: 30, windowMs: 60_000 },
  start: { limit: 8, windowMs: 60_000 },
  geocode: { limit: 40, windowMs: 60_000 },
  status: { limit: 120, windowMs: 60_000 },
  save: { limit: 20, windowMs: 60_000 },
};

function requestIdentity(request: NextRequest, userId: string) {
  return createHash("sha256").update(`${clientAddress(request.headers)}:${userId}`).digest("hex");
}

export function checkProjectRateLimit(action: ProjectRateLimitAction, request: NextRequest, userId: string): Promise<RateLimitDecision> {
  return getRateLimitProvider().consume({ key: `projects:${action}:${requestIdentity(request, userId)}`, ...policies[action] });
}