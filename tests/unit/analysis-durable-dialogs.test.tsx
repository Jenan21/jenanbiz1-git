import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalysisFailed, AnalysisProgress } from "@/components/projects/project-analysis-dialogs";
import { analysisSignInHref } from "@/lib/projects/analysis-errors";

describe("durable analysis dialog states", () => {
  it("offers sign-in with the project and run instead of resubmitting after session expiry", () => {
    const href = analysisSignInHref("/projects/analysis/progress?project=p&run=r");
    const html = renderToStaticMarkup(<AnalysisFailed ar={false} message="Your session has ended." onRetry={() => {}} onReview={() => {}} signInHref={href} />);
    expect(html).toContain(href);
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Try again");
  });

  it("disables retry during Retry-After and for nonretryable failures", () => {
    for (const options of [{ retryAfterMs: 10_000 }, { retryDisabled: true }]) {
      const html = renderToStaticMarkup(<AnalysisFailed ar={false} message="Please wait." onRetry={() => {}} onReview={() => {}} {...options} />);
      expect(html).toMatch(/<button[^>]*disabled=""/);
      expect(html).toContain("Review data");
    }
  });

  it.each([true, false])("does not claim a pending job is already processing (Arabic=%s)", (ar) => {
    const html = renderToStaticMarkup(<AnalysisProgress ar={ar} completed={0} known={false} pending />);
    expect(html).toContain(ar ? "بانتظار بدء التحليل" : "Waiting for analysis to start");
    expect(html).not.toContain(ar ? "تقرأ المنصة الآن" : "The platform is reading");
    expect(html).not.toContain("100%");
  });
});
