import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/data-center", notFound: () => { throw new Error("NOT_FOUND"); } }));

import { DataCenterWorkspace } from "@/components/admin/data-center/workspace";
import { PlatformMetrics } from "@/components/admin/data-center/platform-metrics";
import { parsePlatformMetrics, PLATFORM_METRIC_KEYS, PLATFORM_METRIC_LABELS, type PlatformMetricsState } from "@/lib/admin/data-center-platform-metric-keys";

// Figures of the former page that were invented or derived from a robot's skill, and must never come back.
const removed = ["+18%", "+11%", "+9%", "سلامة النظام", "مزامنة مباشرة", "حالة النظام", "الأولويات التشغيلية", "اختبار جودة البيانات", "ثقة السلسلة", "كفاءة التخزين", "averageSkill"];
const measuredAt = "2026-10-20T02:00:00.000Z";
const counts = { users: 7, organizations: 3, robots: 0, tasks: 12, sharedKnowledge: 5, learningLog: 0, verifiedEvidence: 2, modelExecutions: 40, costRecords: 9 };
const states: Record<string, PlatformMetricsState> = {
  loading: { status: "loading" }, unavailable: { status: "unavailable" }, ready: parsePlatformMetrics({ measuredAt, counts }),
};
const render = (state: PlatformMetricsState) => renderToStaticMarkup(createElement(PlatformMetrics, { state }));

describe("Platform Metrics show only real database counts", () => {
  it("parses a measured payload and keeps zero as zero", () => {
    expect(states.ready).toEqual({ status: "ready", measuredAt, counts });
  });

  it("turns anything that is not a plain count into unavailable, never into zero", () => {
    const parsed = parsePlatformMetrics({
      measuredAt, counts: { users: -1, organizations: 1.5, robots: "3", tasks: Number.NaN, sharedKnowledge: Number.MAX_SAFE_INTEGER + 1, verifiedEvidence: 2 },
    });
    expect(parsed).toMatchObject({ status: "ready" });
    if (parsed.status !== "ready") return;
    expect(parsed.counts.verifiedEvidence).toBe(2);
    for (const key of ["users", "organizations", "robots", "tasks", "sharedKnowledge", "learningLog", "modelExecutions", "costRecords"] as const) expect(parsed.counts[key]).toBeNull();
  });

  it("treats a malformed or missing payload as unavailable", () => {
    for (const payload of [undefined, null, "x", {}, { measuredAt: "not a date", counts }, { measuredAt, counts: null }, { counts }]) {
      expect(parsePlatformMetrics(payload)).toEqual({ status: "unavailable" });
    }
  });

  it("shows an ellipsis while loading and an explicit notice when unavailable, never a zero", () => {
    const loading = render(states.loading);
    expect(loading.match(/…/g)).toHaveLength(PLATFORM_METRIC_KEYS.length);
    expect(loading).not.toContain(">0<");
    const unavailable = render(states.unavailable);
    expect(unavailable.match(/غير متاح/g)).toHaveLength(PLATFORM_METRIC_KEYS.length);
    expect(unavailable).toContain("لم تُعرض أرقام بديلة");
    expect(unavailable).not.toContain(">0<");
  });

  it("shows every real count with its own label, preserves zero, and states when it was measured", () => {
    const html = render(states.ready);
    for (const key of PLATFORM_METRIC_KEYS) expect(html).toContain(PLATFORM_METRIC_LABELS[key]);
    for (const value of [7, 3, 12, 5, 2, 40, 9]) expect(html).toContain(`<strong>${value}</strong>`);
    expect(html.match(/<strong>0<\/strong>/g)).toHaveLength(2);
    expect(html).toContain(`dateTime="${measuredAt}"`);
  });

  it("never shows a percentage, a health figure or any removed invented figure, in any state", () => {
    for (const state of Object.values(states)) {
      const html = render(state);
      expect(html).not.toContain("%");
      for (const text of removed) expect(html).not.toContain(text);
    }
  });

  it("appears in the overview only, and the overview carries none of the removed figures", () => {
    const overview = renderToStaticMarkup(createElement(DataCenterWorkspace, { section: "overview" }));
    expect(overview).toContain("Platform Metrics");
    for (const key of PLATFORM_METRIC_KEYS) expect(overview).toContain(PLATFORM_METRIC_LABELS[key]);
    for (const text of removed) expect(overview).not.toContain(text);
    for (const section of ["sources", "data", "knowledge", "settings"] as const) {
      expect(renderToStaticMarkup(createElement(DataCenterWorkspace, { section }))).not.toContain("Platform Metrics");
    }
  });

  it("keeps the removed figures out of the source files of the page, its metrics and its API", () => {
    const files = [
      "app/admin/data-center/page.tsx", "components/admin/data-center/workspace.tsx", "components/admin/data-center/platform-metrics.tsx",
      "lib/admin/data-center-platform-metrics.ts", "lib/admin/data-center-platform-metric-keys.ts", "lib/admin/data-center-http.ts",
    ];
    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      for (const text of removed) expect(source, `${file} must not contain ${text}`).not.toContain(text);
    }
  });
});
