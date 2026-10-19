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
      // Turbopack's tiny async-loader stub is not the renderer or its engine.
      /\/(?:api\/(?:admin\/)?jenan-map|jenan-map\/maplibre)|maplibre-gl|pmtiles/.test(
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
        expect(response?.headers()["permissions-policy"]).toContain("geolocation=()");
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
  test("sign-in preserves an explicitly requested preview rather than substituting production", async ({ page }) => {
    const id = "00000000-0000-4000-8000-000000000001";
    await page.goto(`/jenan-map?preview=${id}`);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/auth");
    expect(url.searchParams.get("next")).toBe(`/jenan-map?preview=${id}`);
  });

  test("anonymous callers cannot read map, search, artifacts, preview or administrator APIs", async ({
    request,
    baseURL,
  }) => {
    const id = "00000000-0000-4000-8000-000000000001";
    for (const path of [
      "/api/jenan-map",
      "/api/jenan-map/location",
      `/api/jenan-map/preferences?releaseId=${id}`,
      "/api/jenan-map/search?q=Riyadh",
      `/api/jenan-map/artifacts/${id}`,
      "/api/admin/jenan-map",
      "/api/admin/jenan-map/layers",
      "/api/admin/jenan-map/health",
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
    await page.route("**/api/jenan-map/preferences?*", (route) =>
      route.fulfill({ json: { settings: null } }),
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
      expect(manifestRequests).toBeGreaterThanOrEqual(1);
      expect(manifestRequests).toBeLessThanOrEqual(2);
      const requestsWhileOpen = manifestRequests;
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
      expect(manifestRequests).toBe(requestsWhileOpen);
      expect(
        resources.filter(
          (url) =>
            !url.endsWith("/api/jenan-map") &&
            !url.endsWith("/api/jenan-map/location"),
        ),
      ).toEqual([]);
    });
  }

  const stopped = "Jenan PRO Map قيد التحديث حاليًا، ستعود الخدمة قريبًا.";
  for (const [status, message, maintenanceMessage] of [
    ["maintenance", stopped, undefined],
    ["maintenance", "نعود بعد تحديث الطبقات ظهر الخميس.", "نعود بعد تحديث الطبقات ظهر الخميس."],
    ["disabled", stopped, undefined],
  ]) {
    test(`${status} state cannot confirm a selection (${maintenanceMessage ? "custom message" : "standard message"})`, async ({ page }) => {
      await page.route("**/api/jenan-map", (route) =>
        route.fulfill({ json: { status, release: null, maintenanceMessage } }),
      );
      await page.goto("/jenan-map");
      await page
        .getByRole("button", { name: "اختيار موقع على الخريطة" })
        .click();
      await expect(page.getByRole("heading", { name: message })).toBeVisible();
      await expect(page.getByText("بقية خدمات المنصة تعمل كالمعتاد")).toBeVisible();
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

  test("a slow first open explains itself and is not cut off at ten seconds", async ({ page }) => {
    // The first request after a server start makes the server check every file of the release, which takes longer than the interactive requests.
    await page.route("**/api/jenan-map", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 12_000));
      await route.fulfill({ json: { status: "maintenance", release: null } });
    });
    await page.goto("/jenan-map");
    await page.getByRole("button", { name: "اختيار موقع على الخريطة" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "جارٍ الاتصال بخريطة جنان برو…" })).toBeVisible();
    await expect(dialog.getByText("أول فتح بعد التحديث يتحقق من سلامة ملفات الخريطة")).toBeVisible({ timeout: 9_000 });
    await expect(dialog.getByRole("heading", { name: stopped })).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("انتهت مهلة الاتصال")).toHaveCount(0);
    await expect(dialog.getByText("أول فتح بعد التحديث")).toHaveCount(0);
  });

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
      `/api/admin/jenan-map/search?releaseId=${id}&q=Riyadh`,
      "/api/admin/jenan-map/health",
    ]) {
      expect((await page.request.get(path)).status()).toBe(403);
    }
    expect((await page.request.post("/api/admin/jenan-map/health", { data: { action: "verify-published" } })).status()).toBe(403);
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
    expect((await page.request.put("/api/jenan-map/preferences", {
      headers: { origin: "https://other.example.test" },
      data: {},
    })).status()).toBe(403);
  });

  test("display settings restore on reopen while cancelled location drafts remain unsaved", async ({ page }) => {
    const releaseId = "00000000-0000-4000-8000-000000000001";
    await page.route("**/api/jenan-map", (route) => route.fulfill({
      json: { status: "enabled", release: {
        id: releaseId, version: "settings-fixture-not-production", styleUrl: null,
        layers: [{ id: "roads", label: "الطرق", available: true, styleLayerIds: ["road-line"] }],
      } },
    }));
    let saved: Record<string, unknown> | null = null;
    await page.route("**/api/jenan-map/preferences**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { settings: saved } });
        return;
      }
      const { expectedRevision, ...values } = route.request().postDataJSON();
      expect(expectedRevision).toBe(0);
      expect(values).toMatchObject({ radius: 3000, visibleLayers: [] });
      saved = { ...values, revision: 1 };
      await route.fulfill({ json: { settings: saved } });
    });

    await page.goto("/jenan-map");
    await page.getByRole("button", { name: "اختيار موقع على الخريطة" }).click();
    await page.getByRole("radio", { name: "3 كم" }).check();
    await page.getByRole("checkbox", { name: "الطرق" }).uncheck();
    await page.getByRole("button", { name: "حفظ إعدادات العرض", exact: true }).click();
    await expect(page.getByText("تم حفظ إعدادات العرض في حسابك لهذا الإصدار.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "إلغاء", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: "اختيار موقع على الخريطة" }).click();
    await expect(page.getByRole("radio", { name: "3 كم" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "الطرق" })).not.toBeChecked();
    await page.getByRole("button", { name: "إلغاء", exact: true }).click();
    await expect(page.getByText("لا يوجد موقع محفوظ بعد.", { exact: false })).toBeVisible();
  });

  test("device geolocation is permitted only on the map and saves its actual source", async ({ page, context }) => {
    const releaseId = "00000000-0000-4000-8000-000000000001";
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 24.7136, longitude: 46.6753, accuracy: 10 });
    await page.route("**/api/jenan-map", (route) => route.fulfill({
      json: { status: "enabled", release: {
        id: releaseId, version: "device-fixture-not-production", styleUrl: null, layers: [],
      } },
    }));
    let source = "";
    await page.route("**/api/jenan-map/location", (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { location: null } });
      const point = route.request().postDataJSON();
      source = point.source;
      return route.fulfill({ json: { location: {
        ...point, country: "SA", region: null, city: null, district: null,
        formattedAddress: null, selectedAt: "2026-10-01T12:00:00.000Z",
      } } });
    });
    const response = await page.goto("/jenan-map");
    expect(response?.headers()["permissions-policy"]).toContain("geolocation=(self)");
    await page.getByRole("button", { name: "اختيار موقع على الخريطة" }).click();
    await page.getByRole("button", { name: "استخدام موقعي الحالي", exact: false }).click();
    await expect(page.getByRole("button", { name: "تأكيد الموقع" })).toBeEnabled();
    await page.getByRole("button", { name: "تأكيد الموقع" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(source).toBe("geolocation");
  });

  test("search follows visible layer changes without retaining stale category results", async ({ page }) => {
    const releaseId = "00000000-0000-4000-8000-000000000001";
    await page.route("**/api/jenan-map", (route) => route.fulfill({
      json: { status: "enabled", release: {
        id: releaseId, version: "search-fixture-not-production", styleUrl: null,
        layers: [{ id: "roads", label: "الطرق", available: true, styleLayerIds: ["road-line"] }],
      } },
    }));
    const selections: string[] = [];
    await page.route("**/api/jenan-map/search?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      expect(params.get("releaseId")).toBe(releaseId);
      const selected = params.get("layerIds")!;
      selections.push(selected);
      return route.fulfill({ json: { results: [{
        id: selected ? "road" : "city", label: selected ? "نتيجة طبقة الطرق" : "نتيجة المدينة",
        latitude: 24.7, longitude: 46.6,
      }] } });
    });
    await page.goto("/jenan-map");
    await page.getByRole("button", { name: "اختيار موقع على الخريطة" }).click();
    await page.getByLabel("البحث عن موقع", { exact: true }).fill("الرياض");
    await expect(page.getByRole("button", { name: "نتيجة طبقة الطرق" })).toBeVisible();
    await page.getByRole("checkbox", { name: "الطرق" }).uncheck();
    await expect(page.getByRole("button", { name: "نتيجة طبقة الطرق" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "نتيجة المدينة" })).toBeVisible();
    expect(selections).toEqual(["roads", ""]);
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
