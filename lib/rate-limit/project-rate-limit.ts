import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { RateLimitDecision } from "@/lib/rate-limit/contracts";
import { getRateLimitProvider } from "@/lib/rate-limit/auth-rate-limit";

export type ProjectRateLimitAction = "create" | "assessment" | "financial" | "intelligence" | "risk" | "decision" | "membership" | "phase" | "start";

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
};

function requestIdentity(request: NextRequest, userId: string) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(`${ip}:${userId}`).digest("hex");
}

export function checkProjectRateLimit(action: ProjectRateLimitAction, request: NextRequest, userId: string): Promise<RateLimitDecision> {
  return getRateLimitProvider().consume({ key: `projects:${action}:${requestIdentity(request, userId)}`, ...policies[action] });
}