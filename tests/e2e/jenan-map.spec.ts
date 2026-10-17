import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);

const viewports = [
  { width: 2560, height: 1440 },
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1024, height: 1366 },
  { width: 820, height: 1180 },
  { width: 430, height: 932 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

function watchMapResources(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      /\/(?:api\/(?:admin\/)?jenan-map|jenan-map\/maplibre)|maplibre-gl|pmtiles|map-renderer/.test(
        request.url(),
      )
    ) {
      requests.push(request.url());
    }
  });
  return requests;
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

test.describe("public map isolation", () => {
  for (const viewport of [viewports[2], viewports[6], viewports[8]]) {
    for (const path of ["/", "/login", "/register"]) {
      test(`${path} does not initialize Jenan Map at ${viewport.width}px`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const resources = watchMapResources(page);
        const response = await page.goto(path);
        expect(response?.ok()).toBe(true);
        await page.evaluate(() => document.fonts.ready);
        await expect(
          page.locator(".maplibregl-map, .maplibregl-canvas"),
        ).toHaveCount(0);
        await expectNoHorizontalOverflow(page);
        expect(resources).toEqual([]);
      });
    }
  }

  test("the standalone harness requires sign-in", async ({ page }) => {
    await page.goto("/jenan-map");
    await expect(page).toHaveURL(/\/auth\?next=%2Fjenan-map/);
    await expect(page.locator(".maplibregl-map")).toHaveCount(0);
  });

  test("anonymous callers cannot read map, search, artifacts, preview or administrator APIs", async ({
    request,
    baseURL,
  }) => {
    const id = "00000000-0000-4000-8000-000000000001";
    for (const path of [
      "/api/jenan-map",
      "/api/jenan-map/location",
      "/api/jenan-map/search?q=Riyadh",
      `/api/jenan-map/artifacts/${id}`,
      "/api/admin/jenan-map",
      "/api/admin/jenan-map/layers",
      `/api/admin/jenan-map/preview?releaseId=${id}`,
      `/api/admin/jenan-map/export?releaseId=${id}`,
      `/api/admin/jenan-map/artifacts/${id}`,
    ]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
      expect(await response.text()).not.toMatch(
        /PrismaClient|passwordHash|node_modules/,
      );
    }
    const response = await request.post("/api/jenan-map/validate", {
      headers: { origin: new URL(baseURL!).origin },
      data: { latitude: 24.7136, longitude: 46.6753 },
    });
    expect(response.status()).toBe(401);
    expect(
      (
        await request.put("/api/jenan-map/location", {
          headers: { origin: new URL(baseURL!).origin },
          data: {
            latitude: 24.7136,
            longitude: 46.6753,
            source: "coordinates",
          },
        })
      ).status(),
    ).toBe(401);
  });
});

test.describe("authenticated map harness — fixture states, not real-map acceptance", () => {
  let token: string;
  let email: string;

  test.beforeAll(async () => {
    const fixtures = await import("./identity-fixture");
    const { e2eIdentity } = await import("./test-identities");
    email = e2eIdentity.user.email;
    await fixtures.seedE2EUser();
    token = await fixtures.createE2ESession(email);
  });

  test.afterAll(async () => {
    if (!email) return;
    const { queryE2E } = await import("./identity-fixture");
    await queryE2E('DELETE FROM "User" WHERE email = $1', [email]);
  });

  test.beforeEach(async ({ context, baseURL, page }) => {
    await context.addCookies([
      { name: "jenan_session", value: token, url: baseURL! },
    ]);
    await page.route("**/api/jenan-map/location", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ json: { location: null } })
        : route.continue(),
    );
  });

  for (const viewport of viewports) {
    test(`no published release is accessible and contained at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const resources = watchMapResources(page);
      let manifestRequests = 0;
      await page.route("**/api/jenan-map", async (route) => {
        manifestRequests++;
        await route.fulfill({
          json: {
            status: "unavailable",
            release: null,
            reason: "NO_PUBLISHED_RELEASE",
          },
        });
      });
      await page.goto("/jenan-map");
      const trigger = page.getByRole("button", {
        name: "اختيار موقع على الخريطة",
      });
      await expect(trigger).toBeVisible();
      expect(manifestRequests).toBe(0);
      expect(resources).toEqual([]);
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("heading", {
          name: "لا يوجد إصدار خريطة منشور متاح حالياً.",
        }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "تأكيد الموقع" }),
      ).toBeDisabled();
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
        viewport.height + 1,
      );
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Tab");
      await expect(
        dialog.getByRole("button", { name: "إغلاق الخريطة دون حفظ" }),
      ).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(
        dialog.getByRole("button", { name: "إلغاء", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(
        dialog.getByRole("button", { name: "إغلاق الخريطة دون حفظ" }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(manifestRequests).toBe(1);
      expect(
        resources.filter(
          (url) =>
            !url.endsWith("/api/jenan-map") &&
            !url.endsWith("/api/jenan-map/location"),
        ),
      ).toEqual([]);
    });
  }

  for (const [status, message] of [
    ["maintenance", "الخريطة تحت الصيانة حالياً. لم يتم تغيير موقعك المحفوظ."],
    ["disabled", "خدمة الخريطة معطلة حالياً."],
  ]) {
    test(`${status} state cannot confirm a selection`, async ({ page }) => {
      await page.route("**/api/jenan-map", (route) =>
        route.fulfill({ json: { status, release: null } }),
      );
      await page.goto("/jenan-map");
      await page
        .getByRole("button", { name: "اختيار موقع على الخريطة" })
        .click();
      await expect(page.getByRole("heading", { name: message })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "تأكيد الموقع" }),
      ).toBeDisabled();
      await page.getByRole("button", { name: "إلغاء", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByText("لا يوجد موقع محفوظ بعد.", { exact: false }),
      ).toBeVisible();
    });
  }

  test("ordinary members cannot reach preview, admin assets or cross-origin validation", async ({
    page,
    baseURL,
  }) => {
    const results = await page.request.get("/api/admin/jenan-map");
    expect(results.status()).toBe(403);
    const id = "00000000-0000-4000-8000-000000000001";
    for (const path of [
      `/api/admin/jenan-map/preview?releaseId=${id}`,
      `/api/admin/jenan-map/artifacts/${id}`,
    ]) {
      expect((await page.request.get(path)).status()).toBe(403);
    }
    expect(
      (
        await page.request.post("/api/jenan-map/validate", {
          headers: {
            origin: `https://not-${new URL(baseURL!).hostname}.example.test`,
          },
          data: { latitude: 24.7136, longitude: 46.6753 },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.put("/api/jenan-map/location", {
          headers: { origin: "https://other.example.test" },
          data: {
            latitude: 24.7136,
            longitude: 46.6753,
            source: "coordinates",
          },
        })
      ).status(),
    ).toBe(403);
  });

  test("manual drafts confirm only through validation and cancel leaves the saved value unchanged", async ({
    page,
  }) => {
    const releaseId = "00000000-0000-4000-8000-000000000001";
    await page.route("**/api/jenan-map", (route) =>
      route.fulfill({
        json: {
          status: "enabled",
          release: {
            id: releaseId,
            version: "ui-fixture-not-production",
            styleUrl: null,
            layers: [],
          },
        },
      }),
    );
    let saves = 0;
    let savedLocation: Record<string, unknown> | null = null;
    await page.route("**/api/jenan-map/location", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { location: savedLocation } });
        return;
      }
      expect(route.request().method()).toBe("PUT");
      const point = route.request().postDataJSON();
      expect(point).toEqual({
        latitude: 24.7136,
        longitude: 46.6753,
        source: "coordinates",
        releaseId,
      });
      saves++;
      savedLocation = {
        ...point,
        country: "SA",
        region: null,
        city: null,
        district: null,
        formattedAddress: null,
        selectedAt: "2026-10-01T12:00:00.000Z",
      };
      await route.fulfill({ json: { location: savedLocation } });
    });
    await page.goto("/jenan-map");
    await page.getByRole("button", { name: "اختيار موقع على الخريطة" }).click();
    await page.getByLabel("خط العرض", { exact: true }).fill("24.7136");
    await page.getByLabel("خط الطول", { exact: true }).fill("46.6753");
    await page.getByRole("button", { name: "عرض النقطة", exact: true }).click();
    await page.getByRole("button", { name: "تأكيد الموقع" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("24.713600, 46.675300", { exact: true }),
    ).toBeVisible();
    expect(saves).toBe(1);
    await page.getByRole("button", { name: "تعديل الموقع" }).click();
    await page.getByLabel("خط العرض", { exact: true }).fill("25");
    await page.getByRole("button", { name: "إلغاء", exact: true }).click();
    await expect(
      page.getByText("24.713600, 46.675300", { exact: true }),
    ).toBeVisible();
    expect(saves).toBe(1);
    await page.reload();
    await expect(
      page.getByText("لم يتم تحميل الموقع المحفوظ بعد.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "اختيار موقع على الخريطة" }).click();
    await expect(page.getByLabel("خط العرض", { exact: true })).toHaveValue(
      "24.7136",
    );
    await expect(page.getByLabel("خط الطول", { exact: true })).toHaveValue(
      "46.6753",
    );
    await page.getByRole("button", { name: "إلغاء", exact: true }).click();
    await expect(
      page.getByText("24.713600, 46.675300", { exact: true }),
    ).toBeVisible();
    expect(saves).toBe(1);
  });
});
