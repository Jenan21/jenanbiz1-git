export type MotionLevel = "full" | "reduced";

export interface MotionToken {
  name: string;
  durationMs: number;
  easing: string;
}

export function resolveMotionLevel(prefersReducedMotion: boolean): MotionLevel {
  return prefersReducedMotion ? "reduced" : "full";
}

export function getMotionTokens(level: MotionLevel): MotionToken[] {
  if (level === "reduced") {
    return [
      { name: "fade", durationMs: 80, easing: "linear" },
      { name: "emphasis", durationMs: 100, easing: "linear" },
    ];
  }
  return [
    { name: "fade", durationMs: 220, easing: "cubic-bezier(0.4,0,0.2,1)" },
    { name: "emphasis", durationMs: 320, easing: "cubic-bezier(0.2,0,0,1)" },
    { name: "glow", durationMs: 1200, easing: "ease-in-out" },
  ];
}
