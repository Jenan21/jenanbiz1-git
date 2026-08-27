import { expect, test } from "@playwright/test";

test.describe("academy cinematic preview", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    await context.addCookies([{ name: "locale", value: "ar", url: baseURL }]);
  });

  test("shows the four approved academy paths in one desktop row", async ({
    page,
  }) => {
    await page.goto("/academy-showcase-review");
    await expect(page.getByRole("heading", { name: "المعرفة مفتاح تحقيق أحلامك وبوابة المستقبل." })).toBeVisible();
    const paths = page.locator(".academy-cinema__path");
    await expect(paths).toHaveCount(4);
    await expect(page.locator(".platform-context__logo")).toHaveCount(1);
    await expect(page.locator(".academy-cinema__brand")).toHaveCount(0);
    const boxes = await paths.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().toJSON()),
    );
    expect(Math.max(...boxes.map((box) => box.y)) - Math.min(...boxes.map((box) => box.y))).toBeLessThan(3);
  });

  test("keeps truthful preview messaging", async ({ page }) => {
    await page.goto("/academy-showcase-review");
    await expect(page.getByText("محتوى ومسارات تجريبية")).toBeVisible();
    await expect(page.getByText("لا تسجيل أو بيانات فعلية")).toBeVisible();
  });

  test("keeps the light command bar integrated with the cinematic scene", async ({ page }) => {
    await page.setViewportSize({ width: 1754, height: 900 });
    await page.goto("/academy-showcase-review");

    const layout = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(".platform-header")?.getBoundingClientRect();
      const body = document.querySelector<HTMLElement>(".platform-body")?.getBoundingClientRect();
      const intro = document.querySelector<HTMLElement>(".academy-cinema__intro")?.getBoundingClientRect();
      return {
        bodyTop: body?.top ?? -1,
        headerBottom: header?.bottom ?? -1,
        headerHeight: header?.height ?? -1,
        headerTop: header?.top ?? -1,
        introTop: intro?.top ?? -1,
      };
    });

    expect(Math.abs(layout.headerTop - layout.bodyTop)).toBeLessThanOrEqual(1);
    expect(layout.headerHeight).toBeLessThanOrEqual(60);
    expect(layout.introTop).toBeGreaterThan(layout.headerBottom + 20);
    await expect(page.locator(".platform-header__signal")).toContainText("LEARN / 02");
    await expect(page.locator(".platform-header__signal")).toContainText("معرفة تتطور مع الأعمال");
    await expect(page.locator(".platform-context__logo")).toHaveCSS("width", "90px");
    await expect(page.locator(".platform-context > span")).toHaveCount(0);
    await expect(page.locator(".platform-header .top-tools .icon").first()).toHaveCSS("width", "20px");
  });

  test("opens every academy subpage from the showcase preview", async ({ page }) => {
    await page.goto("/academy-showcase-review");
    const destinations = [
      ["الدراسات", "/academy-studies-review"],
      ["الندوات", "/academy-path-review/seminars"],
      ["الأبحاث", "/academy-path-review/research"],
      ["الدورات الدراسية", "/academy-path-review/courses"],
    ] as const;

    for (const [name, route] of destinations) {
      await page.getByRole("link", { name: new RegExp(name) }).click();
      await expect(page).toHaveURL(new RegExp(route.replaceAll("/", "\\/")));
      await page.goBack();
    }
  });

  test("every academy preview returns to the preview hub", async ({ page }) => {
    const routes = [
      ["/academy-studies-review", ".academy-studies__back"],
      ["/academy-path-review/seminars", ".academy-path__back"],
      ["/academy-path-review/research", ".academy-path__back"],
      ["/academy-path-review/courses", ".academy-path__back"],
    ] as const;

    for (const [route, selector] of routes) {
      await page.goto(route);
      await expect(page.locator(selector)).toHaveAttribute(
        "href",
        "/academy-showcase-review",
      );
    }
  });

  test("keeps academy copy readable on a compact desktop viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 650 });
    await page.goto("/academy-showcase-review");

    const layout = await page.evaluate(() => {
      const intro = document.querySelector<HTMLElement>(".academy-cinema__intro");
      const paths = document.querySelector<HTMLElement>(".academy-cinema__paths");
      const descriptions = Array.from(
        document.querySelectorAll<HTMLElement>(".academy-cinema__path em"),
      );

      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        introBottom: intro?.getBoundingClientRect().bottom ?? 0,
        pathsTop: paths?.getBoundingClientRect().top ?? 0,
        descriptionsFit: descriptions.every(
          (description) =>
            description.scrollWidth <= description.clientWidth + 1 &&
            description.scrollHeight <= description.clientHeight + 1,
        ),
      };
    });

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.introBottom).toBeLessThan(layout.pathsTop);
    expect(layout.descriptionsFit).toBe(true);
  });

  test("keeps the immersive navigation compact through the zoom breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 689 });
    await page.goto("/academy-showcase-review");
    const layout = await page.evaluate(() => {
      const sidebar = document.querySelector<HTMLElement>(".platform-sidebar")?.getBoundingClientRect();
      const workspace = document.querySelector<HTMLElement>(".platform-workspace")?.getBoundingClientRect();
      return {
        sidebarHeight: sidebar?.height ?? 0,
        sidebarBottom: sidebar?.bottom ?? 0,
        workspaceTop: workspace?.top ?? 0,
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
      };
    });
    expect(layout.sidebarHeight).toBeLessThanOrEqual(74);
    expect(layout.workspaceTop).toBeGreaterThanOrEqual(layout.sidebarBottom);
    expect(layout.width).toBeLessThanOrEqual(layout.viewport + 1);
  });

  test("switches the full academy copy to English", async ({ context, page }) => {
    await context.addCookies([
      { name: "locale", value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto("/academy-showcase-review");
    await expect(page.getByRole("heading", { name: "Knowledge is the key to your dreams and the gateway to the future." })).toBeVisible();
    await expect(page.getByRole("link", { name: /Studies/ })).toBeVisible();
    await expect(page.getByText("NO LIVE ENROLLMENT OR DATA")).toBeVisible();
  });

  test("avoids horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/academy-showcase-review");
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      width: document.documentElement.scrollWidth,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
  });

  test("shows the four bilingual studies fields", async ({ page }) => {
    await page.goto("/academy-studies-review");
    await expect(page.getByRole("heading", { name: "من المعرفة إلى القرار." })).toBeVisible();
    const fields = page.locator(".academy-studies__fields article");
    await expect(fields).toHaveCount(4);
    await expect(page.locator(".platform-context__logo")).toHaveCount(1);
    await expect(page.locator(".academy-studies__brand")).toHaveCount(0);
    await expect(page.getByText("دراسات استراتيجية", { exact: true })).toBeVisible();
    await expect(page.getByText("دراسات مؤسسية", { exact: true })).toBeVisible();
  });

  test("switches the studies experience fully to English", async ({ context, page }) => {
    await context.addCookies([
      { name: "locale", value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto("/academy-studies-review");
    await expect(page.getByRole("heading", { name: "From knowledge to decision." })).toBeVisible();
    await expect(page.getByText("Studies navigator", { exact: true })).toBeVisible();
    await expect(page.getByText("Strategic studies", { exact: true })).toBeVisible();
    await expect(page.getByText("NO LIVE SEARCH OR DATA")).toBeVisible();
  });

  test("keeps studies readable on compact desktop and mobile", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 650 });
    await page.goto("/academy-studies-review");
    const compact = await page.evaluate(() => ({
      viewport: window.innerWidth,
      width: document.documentElement.scrollWidth,
      fields: document.querySelectorAll(".academy-studies__fields article").length,
    }));
    expect(compact.width).toBeLessThanOrEqual(compact.viewport + 1);
    expect(compact.fields).toBe(4);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const mobile = await page.evaluate(() => ({
      viewport: window.innerWidth,
      width: document.documentElement.scrollWidth,
    }));
    expect(mobile.width).toBeLessThanOrEqual(mobile.viewport + 1);
  });

  test("renders the three remaining academy paths in Arabic", async ({ page }) => {
    const paths = [
      ["seminars", "الفكرة تصبح حوارًا."],
      ["research", "السؤال يصبح معرفة."],
      ["courses", "المعرفة تصبح مهارة."],
    ] as const;
    for (const [slug, heading] of paths) {
      await page.goto(`/academy-path-review/${slug}`);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.locator(".academy-path__phases article")).toHaveCount(4);
      await expect(page.locator(".platform-context__logo")).toHaveCount(1);
    }
  });

  test("switches every remaining academy path to English", async ({ context, page }) => {
    await context.addCookies([{ name: "locale", value: "en", domain: "localhost", path: "/" }]);
    const paths = [
      ["seminars", "Ideas become dialogue."],
      ["research", "Questions become knowledge."],
      ["courses", "Knowledge becomes capability."],
    ] as const;
    for (const [slug, heading] of paths) {
      await page.goto(`/academy-path-review/${slug}`);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.getByText("NO LIVE ENROLLMENT OR DATA")).toBeVisible();
    }
  });

  test("keeps the shared academy path template responsive", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/academy-path-review/seminars");
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
});
