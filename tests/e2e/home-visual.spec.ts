import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { SERVICE_PANELS } from "@/components/home/service-panels";

test.setTimeout(90_000);

const homeViewports = [
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1661x947", width: 1661, height: 947 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
] as const;

const activityFixture = {
  activeUsers: 28,
  generatedAt: "2026-09-30T12:00:00.000Z",
  windowMinutes: 15,
  locations: [
    { countryCode: "SA", countryName: { ar: "السعودية", en: "Saudi Arabia" }, activeUsers: 10 },
    { countryCode: "AE", countryName: { ar: "الإمارات", en: "United Arab Emirates" }, activeUsers: 7 },
    { countryCode: "US", countryName: { ar: "الولايات المتحدة", en: "United States" }, activeUsers: 5 },
    { countryCode: "DE", countryName: { ar: "أوروبا", en: "Europe" }, activeUsers: 4 },
  ],
  sourceState: "LIVE",
};

const removedElements = [
  ".global-home__news",
  ".global-home__stats",
  ".global-home__distribution",
  ".global-home__trust",
  ".global-home__nav",
  ".global-home__search",
  ".global-home__bell",
];

async function setLocaleCookie(
  context: BrowserContext,
  locale: "ar" | "en",
  baseURL: string | undefined,
) {
  await context.addCookies([
    { name: "locale", value: locale, url: baseURL ?? "http://127.0.0.1:3101" },
  ]);
}

async function openHome(
  context: BrowserContext,
  page: import("@playwright/test").Page,
  locale: "ar" | "en",
  baseURL: string | undefined,
  activity: "live" | "down" = "live",
) {
  await setLocaleCookie(context, locale, baseURL);
  await page.route("**/api/platform/activity", async (route) => {
    if (activity === "down") await route.fulfill({ status: 503 });
    else
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(activityFixture),
      });
  });
  const activityResponse = page.waitForResponse("**/api/platform/activity");
  const response = await page.goto("/");
  await activityResponse;
  await page.evaluate(() => document.fonts.ready);
  return response;
}

const activePanel = (page: Page) => page.locator('.cine__slide[data-state="active"]');
const activeId = (page: Page) => activePanel(page).getAttribute("data-panel");

type Activation = { id: string; at: number };

// Records when each slide becomes the active one, so the cadence can be measured in the page's own clock.
async function trackActivations(page: Page) {
  await page.evaluate(() => {
    const log: Activation[] = [];
    (window as unknown as { __cine: Activation[] }).__cine = log;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const slide = record.target as HTMLElement;
        if (slide.dataset.state === "active") log.push({ id: slide.dataset.panel ?? "", at: performance.now() });
      }
    });
    document.querySelectorAll<HTMLElement>(".cine__slide").forEach((slide) => {
      observer.observe(slide, { attributeFilter: ["data-state"], attributes: true });
    });
  });
}

const activations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cine: Activation[] }).__cine);

// Every slide must keep its text on the intended lines and inside its boxes at every zoom level of the scaled stage.
async function expectEverySlideFits(page: Page) {
  for (const [index, panel] of SERVICE_PANELS.entries()) {
    await page.locator(".cine__dot").nth(index).click();
    await expect(activePanel(page)).toHaveAttribute("data-panel", panel.id);
    await page.waitForTimeout(450); // let the fade/slide settle
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      const strip = document.querySelector<HTMLElement>(".cine")!;
      const scale = strip.getBoundingClientRect().width / strip.offsetWidth;
      const slide = document.querySelector<HTMLElement>('.cine__slide[data-state="active"]')!;
      const tolerance = 1.5;
      const lines = (element: HTMLElement) =>
        element.getBoundingClientRect().height / (parseFloat(getComputedStyle(element).lineHeight) * scale);
      const textSpan = (element: HTMLElement) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0.5);
        return rects.length
          ? { left: Math.min(...rects.map((rect) => rect.left)), right: Math.max(...rects.map((rect) => rect.right)) }
          : null;
      };

      for (const element of slide.querySelectorAll<HTMLElement>(
        ".cine__title, .cine__sub, .cine__cta-text b, .cine__cta-text small",
      )) {
        if (lines(element) > 1.2) out.push(`${element.className} wraps onto a second line`);
        if (element.scrollWidth > element.clientWidth + 1) out.push(`${element.className} is wider than its box`);
      }

      const cta = slide.querySelector<HTMLElement>(".cine__cta")!.getBoundingClientRect();
      const stripBox = strip.getBoundingClientRect();
      if (cta.left < stripBox.left || cta.right > stripBox.right || cta.bottom > stripBox.bottom) out.push("cta leaves the strip");

      slide.querySelectorAll<HTMLElement>(".cine__tile").forEach((tile, i) => {
        const box = tile.getBoundingClientRect();
        if (box.right > stripBox.right + tolerance || box.left < stripBox.left - tolerance) out.push(`tile ${i} leaves the strip`);
        if (tile.scrollWidth > tile.clientWidth + 1) out.push(`tile ${i} content overflows`);
        for (const part of tile.querySelectorAll<HTMLElement>("b, small, .cine__icon")) {
          const name = `tile ${i} ${part.tagName.toLowerCase()}`;
          const rect = part.getBoundingClientRect();
          if (rect.bottom > box.bottom + tolerance || rect.top < box.top - tolerance) out.push(`${name} leaves the tile`);
          if (part.tagName !== "SPAN" && lines(part) > 2.2) out.push(`${name} wraps to three lines`);
          const span = part.tagName === "SPAN" ? null : textSpan(part);
          if (span && (span.left < box.left + scale - tolerance || span.right > box.right - scale + tolerance)) {
            out.push(`${name} text crosses the tile edge`);
          }
        }
        const icon = tile.querySelector<HTMLImageElement>(".cine__icon img");
        if (!icon || !icon.complete || icon.naturalWidth === 0) out.push(`tile ${i} icon did not load`);
      });

      const scene = slide.querySelector<HTMLImageElement>(".cine__scene img");
      if (!scene || !scene.complete || scene.naturalWidth === 0) out.push("scene did not load");
      return out;
    });
    expect(problems, `${panel.id} slide`).toEqual([]);
  }
}

for (const locale of ["ar", "en"] as const) {
  for (const viewport of homeViewports) {
    test(`pre-login home ${viewport.name} ${locale} keeps the approved composition`, async ({
      context,
      page,
    }, testInfo) => {
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      await page.setViewportSize(viewport);
      const response = await openHome(context, page, locale, testInfo.project.use.baseURL);

      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect(page.locator(".global-home__stage")).toBeVisible();

      // approved decisions: headline, tagline, two access buttons, 4 capabilities, cinematic panels
      await expect(page.locator(".global-home__statement span")).toHaveCount(3);
      await expect(page.locator(".global-home__hero-copy > strong span")).toHaveCount(3);
      await expect(page.locator(".global-home__statement")).toHaveText(
        locale === "ar" ? /بيانات دقيقة\s*رؤى ذكية\s*نمو مستدام/ : /Accurate data\s*Smart insights\s*Sustainable growth/,
      );
      await expect(page.locator(".global-home__statement")).not.toContainText("·");
      await expect(page.locator(".global-home__access-btn")).toHaveCount(2);
      await expect(page.locator('.global-home__access a[href="/login"]')).toBeVisible();
      await expect(page.locator('.global-home__access a[href="/register"]')).toBeVisible();
      await expect(page.locator(".global-home__capabilities article")).toHaveCount(4);
      await expect(page.locator(".global-home__kpis article")).toHaveCount(3);
      await expect(page.locator(".cine__slide")).toHaveCount(SERVICE_PANELS.length);
      await expect(page.locator(".cine__dot")).toHaveCount(SERVICE_PANELS.length);
      await expect(page.locator('.cine__slide[data-state="active"]')).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jenan PRO");

      for (const selector of removedElements) {
        await expect(page.locator(selector), `${selector} must stay removed`).toHaveCount(0);
      }
      const heading = await page.locator(".global-home__hero-copy h1").boundingBox();
      expect(heading!.width).toBeLessThanOrEqual(3);
      expect(heading!.height).toBeLessThanOrEqual(3);

      const layout = await page.evaluate(() => {
        const rect = (selector: string) => {
          const bounds = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
          return bounds
            ? { bottom: bounds.bottom, left: bounds.left, right: bounds.right, top: bounds.top }
            : null;
        };
        const resources = performance
          .getEntriesByType("resource")
          .map((entry) => decodeURIComponent(entry.name));
        return {
          access: rect(".global-home__access"),
          cine: rect(".cine"),
          clipped: Array.from(document.querySelectorAll<HTMLElement>("a,button"))
            .filter((element) => element.checkVisibility() && !element.closest(".cine__slide:not([data-state='active'])"))
            .some((element) => element.scrollWidth > element.clientWidth + 1),
          referenceLoaded: resources.some((resource) =>
            /APPROVED_HOME_REFERENCE|homepage\.png/.test(resource),
          ),
          scrollHeight: document.documentElement.scrollHeight,
          scrollWidth: document.documentElement.scrollWidth,
          viewportHeight: document.documentElement.clientHeight,
          viewportWidth: document.documentElement.clientWidth,
          world: rect(".global-home__world"),
        };
      });

      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
      expect(layout.scrollHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
      expect(layout.clipped).toBe(false);
      expect(layout.referenceLoaded).toBe(false);
      // access buttons sit under the globe and above the service panels, never on top of either
      expect(layout.access!.top).toBeGreaterThanOrEqual(layout.world!.bottom - 12);
      expect(layout.access!.bottom).toBeLessThanOrEqual(layout.cine!.top + 1);
      expect(layout.cine!.bottom).toBeLessThanOrEqual(layout.viewportHeight);

      await testInfo.attach(`home-${viewport.name}-${locale}`, {
        body: await page.screenshot({ animations: "disabled" }),
        contentType: "image/png",
      });
      await expectEverySlideFits(page);
      expect(runtimeErrors).toEqual([]);
    });
  }

  test(`pre-login home ${locale} shows the seven services in order, one every 3 seconds, without scene motion`, async ({
    context,
    page,
  }, testInfo) => {
    test.setTimeout(75_000);
    await page.setViewportSize({ width: 1661, height: 947 });
    await openHome(context, page, locale, testInfo.project.use.baseURL);
    await expect(activePanel(page)).toHaveAttribute("data-panel", SERVICE_PANELS[0].id);

    const moving = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll<HTMLElement>(".cine, .cine *")).filter(
          (element) => getComputedStyle(element).animationName !== "none",
        ).length,
    );
    expect(moving, "cinematic panels must not animate inside the scene").toBe(0);

    await trackActivations(page);
    await page.waitForFunction(
      () => (window as unknown as { __cine: Activation[] }).__cine.length >= 7,
      undefined,
      { timeout: 40_000 },
    );
    const log = await activations(page);
    const order = SERVICE_PANELS.map((panel) => panel.id);
    // the first slide is already showing; a full loop ends back on it
    expect(log.slice(0, 7).map((entry) => entry.id)).toEqual([...order.slice(1), order[0]]);
    for (let i = 1; i < 7; i += 1) {
      const gap = log[i].at - log[i - 1].at;
      expect(gap, `slide ${i} stayed ${Math.round(gap)} ms`).toBeGreaterThan(2700);
      expect(gap, `slide ${i} stayed ${Math.round(gap)} ms`).toBeLessThan(3500);
    }
  });

  test(`pre-login home ${locale} pauses while the pointer is over the panels and resumes afterwards`, async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(context, page, locale, testInfo.project.use.baseURL);
    await page.locator(".cine").hover();
    const held = await activeId(page);
    await page.waitForTimeout(4500);
    expect(await activeId(page)).toBe(held);
    await page.mouse.move(4, 4);
    await expect.poll(() => activeId(page), { timeout: 6000 }).not.toBe(held);
  });

  test(`pre-login home ${locale} pauses while a panel link has keyboard focus`, async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(context, page, locale, testInfo.project.use.baseURL);
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => Boolean(document.activeElement?.closest(".cine")))) break;
    }
    await expect(page.locator(".cine :focus-visible")).toHaveCount(1);
    const held = await activeId(page);
    await page.waitForTimeout(4500);
    expect(await activeId(page)).toBe(held);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect.poll(() => activeId(page), { timeout: 6000 }).not.toBe(held);
  });

  test(`pre-login home ${locale} does not auto-rotate for reduced motion but the dots still work`, async ({
    context,
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(context, page, locale, testInfo.project.use.baseURL);
    const first = await activeId(page);
    await page.waitForTimeout(4500);
    expect(await activeId(page)).toBe(first);
    await page.locator(".cine__dot").nth(3).click();
    await expect(activePanel(page)).toHaveAttribute("data-panel", SERVICE_PANELS[3].id);
  });

  test(`pre-login home ${locale} panels expose carousel semantics, inert hidden slides and the designed links`, async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(context, page, locale, testInfo.project.use.baseURL);
    await expect(page.locator(".cine")).toHaveAttribute("aria-roledescription", "carousel");
    await expect(page.locator(".cine__dot")).toHaveCount(SERVICE_PANELS.length);

    const idle = page.locator('.cine__slide[data-state="idle"]');
    await expect(idle).toHaveCount(SERVICE_PANELS.length - 1);
    for (const slide of await idle.all()) {
      await expect(slide).toHaveAttribute("aria-hidden", "true");
      await expect(slide).toHaveJSProperty("inert", true);
    }

    for (const [index, panel] of SERVICE_PANELS.entries()) {
      await page.locator(".cine__dot").nth(index).click();
      await expect(activePanel(page)).toHaveAttribute("data-panel", panel.id);
      await expect(page.locator(".cine__dot").nth(index)).toHaveAttribute("aria-current", "true");
      const hrefs = await activePanel(page)
        .locator("a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
      expect(hrefs.map((href) => decodeURIComponent(href))).toEqual(
        [panel.cta.href, ...panel.tiles.map((tile) => tile.href)].map((href) => decodeURIComponent(href)),
      );
      const reachable = await page.evaluate(
        () => Array.from(document.querySelectorAll(".cine a")).filter((link) => !link.closest("[inert]")).length,
      );
      expect(reachable).toBe(5);
    }
  });

  test(`pre-login home ${locale} panel links lead into the platform (sign-in first for guests)`, async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(context, page, locale, testInfo.project.use.baseURL);
    await page.locator(".cine__dot").nth(1).click();
    await expect(activePanel(page)).toHaveAttribute("data-panel", "academy");
    await activePanel(page).locator(".cine__cta").click();
    await expect(page).toHaveURL(/\/(academy|login)(\/|\?|$)/);
  });

  test(`pre-login home ${locale} exposes truthful empty activity`, async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1661, height: 947 });
    await openHome(context, page, locale, testInfo.project.use.baseURL, "down");
    await expect(page.locator(".global-home__kpis article").nth(1).locator("strong")).toHaveText("0");
    await expect(page.locator(".global-home__kpis article").nth(2).locator("strong")).toHaveText("0");
  });
}

test("pre-login home opens each auth panel from its button", async ({ context, page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openHome(context, page, "ar", testInfo.project.use.baseURL);
  await page.locator('.global-home__access a[href="/login"]').click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("#access-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
  await page.locator('.global-home__access a[href="/register"]').click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.locator("#access-panel")).toBeVisible();
});
