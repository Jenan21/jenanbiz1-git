import { expect, test } from "@playwright/test";

test.describe("projects interactive previews", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await context.addCookies([{ name: "locale", value: "ar", url: baseURL }]);
  });

  test("analysis reacts to completed inputs and opens advisory preview", async ({
    page,
  }) => {
    await page.goto("/projects-analysis-review");
    await expect(page.locator(".projects-interactive-experience")).toHaveAttribute(
      "data-ready",
      "true",
    );
    const inputs = page.locator(".interactive-inputs input");
    await expect(inputs).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await inputs.nth(index).fill("preview-" + String(index + 1));
    }
    await expect(page.locator(".interactive-inputs header span")).toHaveText(
      "100%",
    );
    await page.locator(".projects-ai-trigger").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("ليست توصية ذكاء اصطناعي فعلية")).toBeVisible();
  });

  test("feasibility lens opens an editable simulated modal", async ({
    page,
  }) => {
    await page.goto("/projects-feasibility-review");
    await page.locator(".interactive-lens").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".project-modal__fields input")).toHaveCount(2);
  });

  test("evaluation action changes the radar polygon", async ({ page }) => {
    await page.goto("/projects-evaluation-review");
    const polygon = page.locator(".interactive-core__polygon");
    const before = await polygon.getAttribute("points");
    await page.locator(".interactive-inputs input").first().fill("مشروع تجريبي");
    await page.locator(".interactive-stage__action").click();
    await expect(polygon).not.toHaveAttribute("points", before ?? "");
  });

  test("launch gates unlock with completed requirements", async ({ page }) => {
    await page.goto("/projects-start-review");
    const gates = page.locator(".interactive-lens");
    await expect(gates.nth(3)).toBeDisabled();
    const inputs = page.locator(".interactive-inputs input");
    for (let index = 0; index < 4; index += 1) {
      await inputs.nth(index).fill("gate-" + String(index + 1));
    }
    await expect(gates.nth(3)).toBeEnabled();
  });

  test("report previews remain truthful visual-only surfaces", async ({ page }) => {
    for (const route of ["/projects-report-review", "/projects-feasibility-report-review", "/projects-evaluation-report-review"]) {
      await page.goto(route);
      await expect(page.locator(".projects-report__paper")).toBeVisible();
      await expect(page.getByRole("button", { name: /PDF/ })).toBeDisabled();
      await expect(page.locator(".projects-report__status")).toBeVisible();
    }
  });

  test("hub portals form one stable bottom row above the market ticker", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/projects-showcase-review");
    const portals = await page.locator(".projects-cinema__portal").evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().toJSON()),
    );
    expect(portals).toHaveLength(4);
    expect(Math.max(...portals.map((portal) => portal.y)) - Math.min(...portals.map((portal) => portal.y))).toBeLessThan(3);
    const market = await page.locator(".projects-hub-market").boundingBox();
    expect(market).not.toBeNull();
    expect(Math.max(...portals.map((portal) => portal.y + portal.height))).toBeLessThan(market?.y ?? 0);
  });

  test("opens every project subpage from the showcase preview", async ({ page }) => {
    await page.goto("/projects-showcase-review");
    const destinations = [
      ["تحليل مشروع", "/projects-analysis-review"],
      ["إعداد دراسة جدوى", "/projects-feasibility-review"],
      ["تقييم مشروع", "/projects-evaluation-review"],
      ["بدء مشروع", "/projects-start-review"],
    ] as const;

    for (const [name, route] of destinations) {
      await page.getByRole("link", { name: new RegExp(name) }).click();
      await expect(page).toHaveURL(new RegExp(route.replaceAll("/", "\\/")));
      await page.goBack();
    }
  });

  test("every project preview returns to the preview hub", async ({ page }) => {
    for (const route of [
      "/projects-analysis-review",
      "/projects-feasibility-review",
      "/projects-evaluation-review",
      "/projects-start-review",
    ]) {
      await page.goto(route);
      await expect(page.locator(".projects-analysis__back")).toHaveAttribute(
        "href",
        "/projects-showcase-review",
      );
    }
  });

  test("report preview avoids horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects-feasibility-report-review");
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
  });

  test("project previews fully switch to English", async ({ context, page }) => {
    await context.addCookies([{ name: "locale", value: "en", domain: "localhost", path: "/" }]);
    await page.goto("/projects-analysis-review");
    await expect(page.getByRole("heading", { name: "Project analysis" })).toBeVisible();
    await expect(page.getByText("Local simulation — data is not saved")).toBeVisible();
    await page.goto("/projects-report-review");
    await expect(page.getByRole("heading", { name: "Executive summary preview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PDF export — inactive" })).toBeDisabled();
  });

  test("every project preview avoids horizontal overflow on compact screens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of [
      "/projects-showcase-review",
      "/projects-analysis-review",
      "/projects-feasibility-review",
      "/projects-evaluation-review",
      "/projects-start-review",
      "/projects-report-review",
      "/projects-feasibility-report-review",
      "/projects-evaluation-report-review",
    ]) {
      await page.goto(route);
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
      expect(dimensions.width, route).toBeLessThanOrEqual(dimensions.viewport + 1);
    }
  });

  test("print preview isolates the report paper", async ({ page }) => {
    await page.goto("/projects-report-review");
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".projects-report__paper")).toBeVisible();
    await expect(page.locator(".projects-report__top")).toBeHidden();
    await expect(page.locator(".platform-sidebar")).toBeHidden();
  });

  test("locked launch gates stay readable and distinct", async ({ page }) => {
    await page.goto("/projects-start-review");
    const lockedGate = page.locator(".interactive-lens:disabled").last();
    await expect(lockedGate).toBeVisible();
    const opacity = Number(await lockedGate.evaluate((element) => getComputedStyle(element).opacity));
    expect(opacity).toBeGreaterThanOrEqual(0.55);
  });
});
