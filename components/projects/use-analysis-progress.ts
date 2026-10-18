"use client";

import { useEffect, useState } from "react";
import { readStage, type AnalysisStage, type AnalysisStatus } from "@/lib/projects/analysis-study";

export type AnalysisProgressState = {
  /** False until the first answer arrives, so a screen never shows a number it has not been told. */
  known: boolean;
  stage?: AnalysisStage;
  status?: AnalysisStatus;
};

/** Reads the recorded step of a run while `active`; the server writes it as each real stage begins. */
export function useAnalysisProgress(projectId: string | null, active: boolean): AnalysisProgressState {
  const [state, setState] = useState<AnalysisProgressState>({ known: false });

  useEffect(() => {
    if (!projectId || !active) return;
    let stopped = false;
    const read = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/analysis-status`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { stage?: string | null; status?: AnalysisStatus; success?: boolean };
        if (stopped || !payload.success) return;
        setState({ known: true, stage: readStage(payload.stage), status: payload.status });
      } catch {
        // A missed read only delays the next update; the run itself is unaffected.
      }
    };
    const first = window.setTimeout(() => void read(), 0);
    const timer = window.setInterval(() => void read(), 1200);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
      setState({ known: false });
    };
  }, [projectId, active]);

  return state;
}
