"use client";

import { useEffect, useState } from "react";
import { AnalysisRequestError, analysisCommand, retryAfterMilliseconds } from "@/lib/projects/analysis-errors";
import { readStage, readStudy, type AnalysisStage, type AnalysisStatus, type AnalysisProject } from "@/lib/projects/analysis-study";

export type AnalysisProgressState = {
  known: boolean;
  stage?: AnalysisStage;
  status?: AnalysisStatus;
  runId?: string;
  updatedAt?: string;
  errorCode?: string;
  retryable?: boolean;
  error?: AnalysisRequestError;
  stopped?: boolean;
};

export type AnalysisDraftIdentity = { projectId: string | null; createdKey: string; savedKey: string; idempotencyKey: string };

export async function prepareAnalysisProject(
  draft: AnalysisDraftIdentity,
  key: string,
  create: Record<string, unknown>,
  input: Record<string, unknown>,
  persist: (draft: AnalysisDraftIdentity) => void,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!draft.projectId || draft.createdKey !== key) {
    if (draft.createdKey !== key || !draft.idempotencyKey) {
      Object.assign(draft, { projectId: null, createdKey: key, savedKey: "", idempotencyKey: crypto.randomUUID() });
      persist(draft);
    }
    const created = await analysisCommand<{ id: string }>({ ...create, action: "create", idempotencyKey: draft.idempotencyKey }, signal);
    signal?.throwIfAborted();
    draft.projectId = created.id;
    persist(draft);
  }
  if (draft.savedKey !== key) {
    await analysisCommand({ action: "saveProjectAnalysis", projectId: draft.projectId, input }, signal);
    signal?.throwIfAborted();
    draft.savedKey = key;
    persist(draft);
  }
  return draft.projectId!;
}

export async function fetchAnalysisProject(projectId: string, signal?: AbortSignal): Promise<AnalysisProject> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store", signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !payload.project) {
    throw new AnalysisRequestError(response.status, payload?.code, response.status === 429 ? retryAfterMilliseconds(response.headers.get("retry-after")) : undefined);
  }
  return payload.project;
}

export async function findActiveAnalysisProject(signal?: AbortSignal): Promise<string | null> {
  for (let offset = 0; ; offset += 100) {
    signal?.throwIfAborted();
    const response = await fetch(`/api/projects?limit=100&offset=${offset}`, { cache: "no-store", signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !Array.isArray(payload.projects)) {
      throw new AnalysisRequestError(response.status, payload?.code, response.status === 429 ? retryAfterMilliseconds(response.headers.get("retry-after")) : undefined);
    }
    const active = (payload.projects as AnalysisProject[]).find((project) => {
      const study = readStudy(project.analysisStudy);
      return study.status === "PROCESSING" || (study.status === "PENDING" && Boolean(study.runId));
    });
    if (active) return active.id;
    if (payload.projects.length < 100) return null;
  }
}

export async function fetchAnalysisStatus(projectId: string, signal?: AbortSignal): Promise<AnalysisProgressState> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/analysis-status`, { cache: "no-store", signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new AnalysisRequestError(response.status, payload?.code, response.status === 429 ? retryAfterMilliseconds(response.headers.get("retry-after")) : undefined);
  }
  if (!["PENDING", "PROCESSING", "COMPLETED", "FAILED"].includes(payload.status)) throw new AnalysisRequestError(502);
  return {
    known: true,
    status: payload.status,
    stage: readStage(payload.stage),
    runId: typeof payload.runId === "string" ? payload.runId : undefined,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : undefined,
    errorCode: typeof payload.errorCode === "string" ? payload.errorCode : undefined,
    retryable: typeof payload.retryable === "boolean" ? payload.retryable : undefined,
  };
}

/** A lost acknowledgement is not a failed job. Never resend until its persisted state is read. */
export async function startAnalysisRun(projectId: string, signal?: AbortSignal) {
  const existing = await fetchAnalysisStatus(projectId, signal);
  if (existing.runId && existing.status !== "FAILED") return { runId: existing.runId, projectId };
  try {
    return await analysisCommand<{ runId: string; projectId: string }>({ action: "runProjectAnalysis", projectId }, signal);
  } catch (error) {
    if (signal?.aborted || (error instanceof AnalysisRequestError && error.status < 500)) throw error;
    const state = await fetchAnalysisStatus(projectId, signal);
    if (state.runId && state.status !== "FAILED") return { runId: state.runId, projectId };
    throw error;
  }
}

/** Recursive scheduling guarantees one request at a time; disposal aborts in-flight reads. */
export function pollAnalysisProgress(projectId: string, onState: (state: AnalysisProgressState) => void) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous: AnalysisProgressState = { known: false };
  const read = async () => {
    let delay = 1500;
    try {
      const state = await fetchAnalysisStatus(projectId, controller.signal);
      if (controller.signal.aborted) return;
      previous = state;
      onState(state);
      if (state.status === "COMPLETED" || state.status === "FAILED") return;
    } catch (error) {
      if (controller.signal.aborted) return;
      const failure = error instanceof AnalysisRequestError ? error : new AnalysisRequestError(0);
      const stopped = failure.status === 401 || failure.status === 404 || (failure.status >= 400 && failure.status < 500 && failure.status !== 429);
      onState({ ...previous, error: failure, stopped });
      if (stopped) return;
      delay = failure.status === 429 ? failure.retryAfterMs ?? 60_000 : 5000;
    }
    if (!controller.signal.aborted) timer = setTimeout(() => void read(), delay);
  };
  timer = setTimeout(() => void read(), 0);
  return () => {
    controller.abort();
    clearTimeout(timer);
  };
}

export function useAnalysisProgress(projectId: string | null, active: boolean, version = 0): AnalysisProgressState {
  const [record, setRecord] = useState<{ projectId: string; version: number; state: AnalysisProgressState } | null>(null);
  useEffect(() => {
    if (!projectId || !active) return;
    return pollAnalysisProgress(projectId, (state) => setRecord({ projectId, version, state }));
  }, [projectId, active, version]);
  return active && record?.projectId === projectId && record.version === version ? record.state : { known: false };
}
