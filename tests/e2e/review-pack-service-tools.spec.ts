import { expect, test } from "@playwright/test";

const suites = [
  ["projects", "analysis", "projects-analysis-review", ["concept-brief", "market-lens", "operating-model", "risk-map"]],
  ["projects", "feasibility-study", "projects-feasibility-review", ["market-viability", "revenue-model", "cost-structure", "decision-gate"]],
  ["projects", "evaluation", "projects-evaluation-review", ["value-scorecard", "market-fit", "readiness-review", "risk-compass"]],
  ["projects", "start", "projects-start-review", ["project-space", "team-builder", "first-roadmap", "launch-gate"]],
  ["academy", "studies", "academy-studies-review", ["strategy-library", "sector-explorer", "market-studies", "institutional-insights"]],
  ["academy", "seminars", "academy-path-review/seminars", ["agenda-builder", "speaker-room", "audience-map", "broadcast-preview"]],
  ["academy", "research", "academy-path-review/research", ["research-brief", "evidence-library", "analysis-canvas", "publication-preview"]],
  ["academy", "courses", "academy-path-review/courses", ["path-planner", "curriculum-map", "practice-lab", "mastery-record"]],
] as const;

test.describe("project and academy service tools", () => {
  test.describe.configure({ timeout: 180_000 });
  test.beforeEach(async ({ context, baseURL }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await context.addCookies([{ name: "locale", value: "ar", url: baseURL }]);
  });

  test("every specialized service exposes its four tool interfaces", async ({
    page,
  }) => {
    for (const [, , reviewRoute] of suites) {
      await page.goto(`/${reviewRoute}`, { waitUntil: "domcontentloaded" });
      const dock = page.locator(".service-tool-dock");
      await expect(dock, reviewRoute).toBeVisible();
      await dock.locator("summary").click();
      await expect(dock.locator("nav a"), reviewRoute).toHaveCount(4);
    }
  });

  test("renders all 32 tool pages as truthful design-only interfaces", async ({
    page,
  }) => {
    for (const [moduleId, serviceSlug, , tools] of suites) {
      for (const toolSlug of tools) {
        const route = `/service-tool-review/${moduleId}/${serviceSlug}/${toolSlug}`;
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.locator(".service-tool-page"), route).toBeVisible();
        await expect(page.locator(".service-tool-inputs input"), route).toHaveCount(4);
        await expect(page.locator(".service-tool-suite nav a"), route).toHaveCount(4);
        await expect(page.getByText("لا حفظ أو نتائج فعلية"), route).toBeVisible();
      }
    }
  });

  test("switches representative project and academy tools fully to English", async ({
    context,
    page,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await context.addCookies([{ name: "locale", value: "en", url: baseURL }]);
    for (const route of [
      "/service-tool-review/projects/analysis/concept-brief",
      "/service-tool-review/academy/courses/path-planner",
    ]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("No storage or live results")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Interface inputs" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Service tool interfaces" })).toBeVisible();
    }
  });

  test("keeps every service tool suite free of horizontal overflow on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [moduleId, serviceSlug, , tools] of suites) {
      const route = `/service-tool-review/${moduleId}/${serviceSlug}/${tools[0]}`;
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(dimensions.scrollWidth, route).toBeLessThanOrEqual(
        dimensions.viewportWidth + 1,
      );
    }
  });
});
