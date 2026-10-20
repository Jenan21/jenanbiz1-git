import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  attachJson, attachShot, changedShare, currentZoom, enabled, evidence, expectDraftAt, expectNoFailedRequests, expectNoPolicyViolations, expectPolicyEnforced, loadState,
  measureRing, metersPerPixel, openPicker, expectPaintedMap, recordPolicyViolations, removeMember, RIYADH, searchAndPick, seedMember, settle, summarize, warm,
  watchMapTraffic, type Member, type Provisioned,
} from "./jenan-map-real-support";

// BROWSER ACCEPTANCE of Jenan PRO Map on REAL Saudi data, for a signed-in member: the real PMTiles, glyphs, style and PostGIS features, through the real
// application, real sessions and the real screens. Opt-in (see jenan-map-real-support.ts):
//   RUN_JENAN_MAP_REAL_E2E=1 JENAN_MAP_LOCAL_RUN=<provisioned folder> DATABASE_URL=postgresql://.../jenan_map_e2e
//   node ./node_modules/@playwright/test/cli.js test jenan-map-real.spec --project=jenan-map-real
test.skip(!enabled, "Opt-in: needs the provisioned real-data environment");

let state: Provisioned;
let member: Member;

const RIYADH_CENTER = { latitude: 24.7136, longitude: 46.6753 };
const CAIRO = { latitude: 30.0444, longitude: 31.2357 };

test.beforeAll(async ({ playwright }) => {
  await expectPolicyEnforced(playwright);
  state = await loadState();
  member = await seedMember("user");
  await warm(playwright, member, ["/jenan-map", "/api/jenan-map", "/api/jenan-map/location", `/api/jenan-map/preferences?releaseId=${state.a.id}`,
    `/api/jenan-map/search?releaseId=${state.a.id}&q=%D8%A7%D9%84%D8%B1%D9%8A%D8%A7%D8%B6`, `/api/jenan-map/releases/${state.a.id}/glyphs/x/0-255.pbf`]);
});

test.afterAll(async () => removeMember(member));

test.beforeEach(async ({ context, baseURL }) => {
  const { queryE2E } = await import("./identity-fixture");
  await queryE2E('DELETE FROM jenan_map.saved_location WHERE "userId" = $1', [member.id]);
  await queryE2E('DELETE FROM jenan_map.preference WHERE "userId" = $1', [member.id]);
  await context.addCookies([{ name: "jenan_session", value: member.token, url: baseURL! }]);
  await context.grantPermissions(["geolocation"]);
  await recordPolicyViolations(context);
});

test.afterEach(async ({ context }) => expectNoPolicyViolations(context));

const mapCanvas = (dialog: Locator) => dialog.locator('canvas[aria-label^="خريطة جنان برو"]');
const marker = (dialog: Locator) => dialog.locator(".maplibregl-marker");

async function centerOf(target: Locator) {
  const box = (await target.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The marker is a real element on the real map: it must sit where the draft says, which after the camera frames the point is the middle of the map. */
async function expectMarkerAtMapCenter(dialog: Locator) {
  await expect(marker(dialog)).toHaveCount(1);
  const [pin, canvas] = await Promise.all([centerOf(marker(dialog)), centerOf(mapCanvas(dialog))]);
  expect(Math.abs(pin.x - canvas.x), "marker is horizontally at the middle of the map").toBeLessThan(8);
  expect(Math.abs(pin.y - canvas.y), "marker is vertically at the middle of the map").toBeLessThan(8);
}

const distanceMeters = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
};

async function draftCoordinates(dialog: Locator) {
  return { latitude: Number(await dialog.getByLabel("خط العرض").inputValue()), longitude: Number(await dialog.getByLabel("خط الطول").inputValue()) };
}

async function savedRow() {
  const { queryE2E } = await import("./identity-fixture");
  return (await queryE2E<Record<string, unknown>>('SELECT latitude, longitude, country, region, city, district, "formattedAddress", source, "selectedAt", "releaseId" FROM jenan_map.saved_location WHERE "userId" = $1', [member.id])).rows[0];
}

function watchMapProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /maplibre|pmtiles|glyph|sprite|tile|AJAXError|jenan-map/i.test(message.text())) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

test.describe("a signed-in member uses the published map", () => {
  test("the published release loads its real style, layers, tiles and Arabic glyphs without one failed request", async ({ page }, testInfo) => {
    const hits = watchMapTraffic(page);
    const problems = watchMapProblems(page);
    const manifest = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/jenan-map" && r.status() === 200);
    const opened = Date.now();
    const dialog = await openPicker(page);
    const loadMs = Date.now() - opened;
    const release = (await (await manifest).json()).release;
    expect(release.id).toBe(state.a.id);
    expect(release.layers.map((layer: { id: string }) => layer.id)).toEqual(expect.arrayContaining(["base", "roads", "places", "pois"]));
    await settle(page);
    await attachShot(page, testInfo, "published-opened");

    // Real layers are listed, with the ones that have no data shown as unavailable instead of invented.
    const layers = dialog.getByRole("group", { name: "طبقات الخريطة" });
    for (const label of ["الطرق", "المعالم والخدمات"]) await expect(layers.getByRole("checkbox", { name: new RegExp(label) })).toBeChecked();
    await expect(layers.getByText("لا توجد بيانات معتمدة متاحة")).toBeVisible();

    const summary = summarize(hits);
    const memory = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);

    // The map must really be on screen: a container that collapsed to nothing, or a context that never painted, leaves the empty panel colour.
    const container = (await dialog.locator(".maplibregl-map").boundingBox())!;
    expect(container.height, "the map container has a height").toBeGreaterThan(300);
    const painted = await expectPaintedMap(await mapCanvas(dialog).screenshot(), "the published map");

    // The attribution is a legal notice: its text must contrast with its pane whatever the basemap under it (WCAG AA, 4.5:1).
    const contrast = await page.evaluate(() => {
      const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const luminance = ([r, g, b]: number[]) => {
        const [lr, lg, lb] = [r, g, b].map((channel) => { const s = channel / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      };
      const ratio = (first: number[], second: number[]) => { const [a, b] = [luminance(first), luminance(second)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); };
      const pane = document.querySelector(".maplibregl-ctrl-attrib") as HTMLElement;
      const [pr, pg, pb, pa = 1] = channels(getComputedStyle(pane).backgroundColor);
      // The pane is translucent: take the worse of the same pane over white and over black.
      const over = (base: number) => [pr, pg, pb].map((channel) => channel * pa + base * (1 - pa));
      const texts = [pane, ...pane.querySelectorAll("a")].map((element) => channels(getComputedStyle(element).color).slice(0, 3));
      return Math.min(...texts.flatMap((text) => [ratio(text, over(255)), ratio(text, over(0))]));
    });
    await attachJson(testInfo, "initial-load.json", { openToMapMs: loadMs, usedJsHeapBytes: memory, mapDetail: painted, attributionContrast: contrast, traffic: summary, problems });
    expect(contrast, "attribution text contrast").toBeGreaterThanOrEqual(4.5);
    expect(summary.kinds.tiles?.requests ?? 0, "vector tiles were read through ranged requests").toBeGreaterThan(0);
    expect(Object.keys(summary.kinds.tiles?.statuses ?? {})).toEqual(["206"]);
    expect(summary.kinds.glyphs?.requests ?? 0, "glyph ranges were requested").toBeGreaterThan(0);
    // Arabic needs the 1536-1791 range; without it every Arabic label would be missing.
    expect(hits.some((hit) => /\/1536-1791\.pbf$/.test(hit.path) && hit.status === 200), "the Arabic glyph range was served").toBe(true);
    expectNoFailedRequests(hits);
    expect(problems).toEqual([]);
  });

  test("§26: Saudi Arabia → Riyadh → district → street → POI → search → marker → save → reopen the same location", async ({ page }, testInfo) => {
    const hits = watchMapTraffic(page);
    const problems = watchMapProblems(page);
    const dialog = await openPicker(page);
    await settle(page);
    await attachShot(page, testInfo, "s26-1-saudi-arabia");

    const city = await searchAndPick(page, dialog, "الرياض", { box: RIYADH });
    await expectDraftAt(dialog, city);
    await settle(page);
    await expectMarkerAtMapCenter(dialog);
    await attachShot(page, testInfo, "s26-2-riyadh");

    const district = await searchAndPick(page, dialog, "النرجس", { box: RIYADH, category: "places" });
    await expectDraftAt(dialog, district);
    await settle(page);
    await expectMarkerAtMapCenter(dialog);
    await attachShot(page, testInfo, "s26-3-district");

    const street = await searchAndPick(page, dialog, "طريق الملك فهد", { box: RIYADH, category: "roads" });
    await expectDraftAt(dialog, street);
    await settle(page);
    await expectMarkerAtMapCenter(dialog);
    await attachShot(page, testInfo, "s26-4-street");

    const poi = await searchAndPick(page, dialog, "مستشفى", { box: RIYADH, category: "pois" });
    await expectDraftAt(dialog, poi);
    await settle(page);
    await expectMarkerAtMapCenter(dialog);
    await attachShot(page, testInfo, "s26-5-poi");

    await dialog.getByRole("button", { name: "تأكيد الموقع" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const card = page.locator('section[aria-labelledby="saved-location-heading"]');
    await expect(card).toContainText(`${poi.latitude.toFixed(6)}, ${poi.longitude.toFixed(6)}`);
    await attachShot(page, testInfo, "s26-6-saved-card");

    // The same location, in the database, with the place it is in, how it was chosen and when.
    const row = await savedRow();
    expect(row).toMatchObject({ latitude: poi.latitude, longitude: poi.longitude, country: "SA", source: "search", releaseId: state.a.id });
    expect(row.region, "region is derived from the real boundaries").toBeTruthy();
    expect(row.city, "city is derived from the real boundaries").toBeTruthy();
    expect(Math.abs(Date.now() - new Date(row.selectedAt as string).getTime())).toBeLessThan(10 * 60_000);

    // Reopen: after a full reload the picker restores that very location, and the marker is on it.
    await page.reload();
    const reopened = await openPicker(page);
    await expectDraftAt(reopened, poi);
    await settle(page);
    await expectMarkerAtMapCenter(reopened);
    await expect(page.locator('section[aria-labelledby="saved-location-heading"]')).toContainText(`${poi.latitude.toFixed(6)}, ${poi.longitude.toFixed(6)}`);
    await attachShot(page, testInfo, "s26-7-reopened");
    const api = await (await page.request.get("/api/jenan-map/location")).json();
    expect(api.location).toMatchObject({ latitude: poi.latitude, longitude: poi.longitude, country: "SA", source: "search", region: row.region, city: row.city, district: row.district });

    await attachJson(testInfo, "s26-found.json", { city, district, street, poi, saved: row, traffic: summarize(hits), problems });
    expectNoFailedRequests(hits);
    expect(problems).toEqual([]);
  });

  test("the analysis ring is a true circle of 500 m, 1 km, 3 km and 5 km, drawn completely in view", async ({ page }, testInfo) => {
    const dialog = await openPicker(page);
    const point = await searchAndPick(page, dialog, "النرجس", { box: RIYADH, category: "places" });
    const rings: Record<string, unknown>[] = [];
    for (const [label, meters] of [["٥٠٠ م", 500], ["1 كم", 1000], ["3 كم", 3000], ["5 كم", 5000]] as const) {
      await dialog.getByRole("radio", { name: label }).check();
      await settle(page, 2000);
      const zoom = (await currentZoom(page, dialog)).zoom;
      // Only the map is measured: the rest of the dialog has buttons of the same colour.
      const picture = await attachShot(page, testInfo, `ring-${meters}m`, mapCanvas(dialog));
      const canvas = (await mapCanvas(dialog).boundingBox())!;
      const pin = await centerOf(marker(dialog));
      const ring = await measureRing(picture, { x: pin.x - canvas.x, y: pin.y - canvas.y });
      const expected = meters / metersPerPixel(zoom, point.latitude);
      rings.push({ meters, zoom, measuredPx: ring.radius, expectedPx: Math.round(expected), coverage: ring.coverage, share: ring.share });
      expect(ring.radius, `${meters} m ring radius in pixels at zoom ${zoom.toFixed(2)}`).toBeGreaterThan(expected * 0.96);
      expect(ring.radius).toBeLessThan(expected * 1.04);
      expect(ring.share, "the line found is a circle around the marker").toBeGreaterThan(0.55);
      expect(ring.coverage, "the ring is drawn in every direction, none of it off screen").toBeGreaterThan(0.88);
      expect(ring.radius * 2, "the whole ring fits the map").toBeLessThan(Math.min(canvas.width, canvas.height));
    }
    await attachJson(testInfo, "rings.json", rings);
  });

  test("on a phone the analysis ring is framed to the small map instead of being left outside it", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = await openPicker(page);
    const point = await searchAndPick(page, dialog, "النرجس", { box: RIYADH, category: "places" });
    await settle(page, 2500);
    const { zoom } = await currentZoom(page, dialog);
    const picture = await attachShot(page, testInfo, "ring-phone", mapCanvas(dialog));
    const canvas = (await mapCanvas(dialog).boundingBox())!;
    const pin = await centerOf(marker(dialog));
    const ring = await measureRing(picture, { x: pin.x - canvas.x, y: pin.y - canvas.y });
    const expected = 1000 / metersPerPixel(zoom, point.latitude);
    await attachJson(testInfo, "ring-phone.json", { zoom, canvas: `${Math.round(canvas.width)}x${Math.round(canvas.height)}`, measuredPx: ring.radius, expectedPx: Math.round(expected), coverage: ring.coverage });
    expect(ring.radius, "the 1 km ring is the radius the zoom implies").toBeGreaterThan(expected * 0.95);
    expect(ring.radius).toBeLessThan(expected * 1.05);
    expect(ring.radius * 2, "the whole ring fits the phone's map").toBeLessThan(Math.min(canvas.width, canvas.height));
    // The point badge and the attribution cover a part of the map on a phone, so a little of the ring may sit under them.
    expect(ring.coverage, "the ring is drawn in most directions").toBeGreaterThan(0.7);
  });

  test("a device location inside Saudi Arabia is saved as such, and one outside is refused", async ({ page, context }, testInfo) => {
    await context.setGeolocation({ ...RIYADH_CENTER, accuracy: 20 });
    const dialog = await openPicker(page);
    await dialog.getByRole("button", { name: /استخدام موقعي الحالي/ }).click();
    await expectDraftAt(dialog, RIYADH_CENTER);
    await expect(dialog.getByText(/دقة الجهاز التقريبية/)).toBeVisible();
    await settle(page);
    await expectMarkerAtMapCenter(dialog);
    await dialog.getByRole("button", { name: "تأكيد الموقع" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await savedRow()).toMatchObject({ ...RIYADH_CENTER, country: "SA", source: "geolocation" });

    // A device somewhere else in the world: the point is shown as a draft, and the server refuses to save it.
    await context.setGeolocation({ ...CAIRO, accuracy: 20 });
    const again = await openPicker(page);
    await again.getByRole("button", { name: /استخدام موقعي الحالي/ }).click();
    await expectDraftAt(again, CAIRO);
    await again.getByRole("button", { name: "تأكيد الموقع" }).click();
    await expect(again.getByText(/خارج الحدود المعتمدة للمملكة العربية السعودية/)).toBeVisible();
    await attachShot(page, testInfo, "geolocation-outside-saudi");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await savedRow(), "the refused point replaced nothing").toMatchObject({ ...RIYADH_CENTER, source: "geolocation" });
  });

  test("typed coordinates are checked against the real Saudi boundary, inside and outside", async ({ page }) => {
    const dialog = await openPicker(page);
    const point = async (latitude: number, longitude: number) => {
      await dialog.getByLabel("خط العرض").fill(String(latitude));
      await dialog.getByLabel("خط الطول").fill(String(longitude));
      await dialog.getByRole("button", { name: "عرض النقطة" }).click();
      await expectDraftAt(dialog, { latitude, longitude });
      await dialog.getByRole("button", { name: "تأكيد الموقع" }).click();
    };
    // Outside: Cairo, Dubai and Sinai
    for (const [latitude, longitude] of [[CAIRO.latitude, CAIRO.longitude], [25.2048, 55.2708], [28.0, 34.2]]) {
      await point(latitude, longitude);
      await expect(dialog.getByText(/خارج الحدود المعتمدة للمملكة العربية السعودية/)).toBeVisible();
      expect(await savedRow()).toBeUndefined();
    }
    // Inside: the middle of the Empty Quarter
    await point(21.2, 51.4);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await savedRow()).toMatchObject({ latitude: 21.2, longitude: 51.4, country: "SA", source: "coordinates" });
  });

  test("a click and a dragged marker move the point by exactly the distance they cover on the ground", async ({ page }, testInfo) => {
    const dialog = await openPicker(page);
    const start = await searchAndPick(page, dialog, "النرجس", { box: RIYADH, category: "places" });
    await settle(page, 2000);
    const { zoom } = await currentZoom(page, dialog);
    const perPixel = metersPerPixel(zoom, start.latitude);

    const canvas = (await mapCanvas(dialog).boundingBox())!;
    const middle = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
    await page.mouse.click(middle.x + 90, middle.y - 60);
    await expect(dialog.getByLabel("خط الطول")).not.toHaveValue(String(start.longitude));
    const clicked = await draftCoordinates(dialog);
    expect(clicked.longitude).toBeGreaterThan(start.longitude);
    expect(clicked.latitude).toBeGreaterThan(start.latitude);
    expect(distanceMeters(start, clicked)).toBeGreaterThan(Math.hypot(90, 60) * perPixel * 0.95);
    expect(distanceMeters(start, clicked)).toBeLessThan(Math.hypot(90, 60) * perPixel * 1.05);
    await settle(page, 1200);

    // Drag the marker itself, wherever the camera now has it.
    const pin = await centerOf(marker(dialog));
    await page.mouse.move(pin.x, pin.y);
    await page.mouse.down();
    await page.mouse.move(pin.x - 60, pin.y + 40, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => (await draftCoordinates(dialog)).longitude).not.toBe(clicked.longitude);
    const dragged = await draftCoordinates(dialog);
    expect(dragged.longitude).toBeLessThan(clicked.longitude);
    expect(dragged.latitude).toBeLessThan(clicked.latitude);
    expect(distanceMeters(clicked, dragged)).toBeGreaterThan(Math.hypot(60, 40) * perPixel * 0.93);
    expect(distanceMeters(clicked, dragged)).toBeLessThan(Math.hypot(60, 40) * perPixel * 1.07);
    await attachShot(page, testInfo, "marker-dragged");

    await dialog.getByRole("button", { name: "تأكيد الموقع" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await savedRow()).toMatchObject({ ...dragged, country: "SA", source: "map" });
  });

  test("layers hide and show on the real map, and the choice survives a reload", async ({ page }, testInfo) => {
    const dialog = await openPicker(page);
    await searchAndPick(page, dialog, "النرجس", { box: RIYADH, category: "places" });
    await settle(page, 2000);
    const area = mapCanvas(dialog);
    const layers = dialog.getByRole("group", { name: "طبقات الخريطة" });
    const roads = layers.getByRole("checkbox", { name: /الطرق/ });
    const pois = layers.getByRole("checkbox", { name: /المعالم والخدمات/ });

    const withRoads = await area.screenshot();
    await roads.uncheck();
    await settle(page, 1800);
    const withoutRoads = await area.screenshot();
    await attachShot(page, testInfo, "layer-roads-hidden", area);
    expect(await changedShare(withRoads, withoutRoads), "hiding the roads layer changes the map").toBeGreaterThan(0.01);
    await roads.check();
    await settle(page, 1800);
    expect(await changedShare(withRoads, await area.screenshot()), "showing it again restores the map").toBeLessThan(0.02);

    // The choice is stored per member and release, and restored on the next visit.
    await pois.uncheck();
    await dialog.getByRole("radio", { name: "3 كم" }).check();
    await dialog.getByRole("button", { name: "حفظ إعدادات العرض" }).click();
    await expect(dialog.getByText("تم حفظ إعدادات العرض")).toBeVisible();
    await page.reload();
    const reopened = await openPicker(page);
    await expect(reopened.getByRole("radio", { name: "3 كم" })).toBeChecked();
    await expect(reopened.getByRole("group", { name: "طبقات الخريطة" }).getByRole("checkbox", { name: /المعالم والخدمات/ })).not.toBeChecked();
    await expect(reopened.getByRole("group", { name: "طبقات الخريطة" }).getByRole("checkbox", { name: /الطرق/ })).toBeChecked();
  });

  test("panning and zooming the real map never spends more than the asset budget, and no request fails", async ({ page }, testInfo) => {
    const hits = watchMapTraffic(page);
    const dialog = await openPicker(page);
    await searchAndPick(page, dialog, "النرجس", { box: RIYADH, category: "places" });
    await settle(page, 2000);
    const before = hits.length;
    const canvas = (await mapCanvas(dialog).boundingBox())!;
    const middle = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
    const started = Date.now();
    await page.mouse.move(middle.x, middle.y);
    // Out to city level, then across it in alternating directions, zooming in and out on the way: every step asks for new tiles and glyphs.
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(900);
    for (let step = 0; step < 8; step++) {
      const direction = step % 2 ? -1 : 1;
      await page.mouse.move(middle.x - 160 * direction, middle.y - 90);
      await page.mouse.down();
      await page.mouse.move(middle.x + 220 * direction, middle.y + 110, { steps: 14 });
      await page.mouse.up();
      await page.waitForTimeout(600);
      await page.mouse.wheel(0, step % 2 ? 250 : -350);
      await page.waitForTimeout(600);
    }
    await settle(page, 2500);
    const session = hits.slice(before);
    const seconds = (Date.now() - started) / 1000;
    const summary = summarize(session);
    await attachJson(testInfo, "pan-zoom-session.json", { seconds, ...summary, requestsPerMinute: Math.round((session.length / seconds) * 60) });
    await attachShot(page, testInfo, "after-pan-zoom");
    expect(session.length, "the interaction made requests").toBeGreaterThan(4);
    expectNoFailedRequests(hits);
    await expect(dialog.getByText("تعذر تحميل بيانات الخريطة المعتمدة")).toHaveCount(0);
  });

  test("a burst of asset requests far past the old budget is served, and the API budget is untouched", async ({ page }, testInfo) => {
    const manifest = await (await page.request.get("/api/jenan-map")).json();
    const style = await (await page.request.get(manifest.release.styleUrl)).json();
    const font: string[] = style.layers.find((layer: { layout?: Record<string, unknown> }) => layer.layout?.["text-font"]).layout["text-font"];
    const url = (style.glyphs as string).replace("{fontstack}", encodeURIComponent(font.join(","))).replace("{range}", "1536-1791");
    const statuses: Record<number, number> = {};
    const requests = 600;
    const started = Date.now();
    for (let batch = 0; batch < requests / 20; batch++) {
      await Promise.all(Array.from({ length: 20 }, async () => {
        const status = (await page.request.get(url)).status();
        statuses[status] = (statuses[status] ?? 0) + 1;
      }));
    }
    const seconds = (Date.now() - started) / 1000;
    await attachJson(testInfo, "asset-burst.json", { requests, seconds, perMinute: Math.round((requests / seconds) * 60), statuses });
    // 180 a minute used to be the whole budget for tiles, glyphs and the style together: this is more than three times that.
    expect(statuses).toEqual({ 200: requests });
    expect((await page.request.get(`/api/jenan-map/search?releaseId=${state.a.id}&q=%D8%A7%D9%84%D8%B1%D9%8A%D8%A7%D8%B6`)).status()).toBe(200);
  });

  test("the picker fits every required screen: no horizontal scrolling, every control inside the screen, a usable map", async ({ page }, testInfo) => {
    const dialog = await openPicker(page);
    await searchAndPick(page, dialog, "النرجس", { box: RIYADH, category: "places" });
    await settle(page, 2000);
    const report: Record<string, unknown>[] = [];
    for (const [width, height] of [[2560, 1440], [1920, 1080], [1440, 900], [1366, 768], [1280, 800], [1024, 1366], [820, 1180], [430, 932], [390, 844], [360, 800]]) {
      await page.setViewportSize({ width, height });
      await settle(page, 1500);
      const layout = await page.evaluate(() => {
        const root = document.querySelector('[role="dialog"]')!;
        const outside = [...root.querySelectorAll<HTMLElement>("button, input, label, h2, h3, legend, [role=status]")]
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => ({ element, rect: element.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1))
          .map(({ element, rect }) => `${element.tagName}:${(element.textContent ?? "").trim().slice(0, 30)}@${Math.round(rect.left)}-${Math.round(rect.right)}`);
        const box = root.getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, outside, dialog: { left: box.left, right: box.right, top: box.top, bottom: box.bottom } };
      });
      const canvas = (await mapCanvas(dialog).boundingBox())!;
      report.push({ width, height, ...layout, map: `${Math.round(canvas.width)}x${Math.round(canvas.height)}` });
      expect(layout.overflow, `${width}x${height}: the page scrolls sideways`).toBeLessThanOrEqual(0);
      expect(layout.outside, `${width}x${height}: controls outside the screen`).toEqual([]);
      expect(layout.dialog.left, `${width}x${height}: dialog left`).toBeGreaterThanOrEqual(-1);
      expect(layout.dialog.right, `${width}x${height}: dialog right`).toBeLessThanOrEqual(width + 1);
      expect(canvas.width, `${width}x${height}: map width`).toBeGreaterThan(Math.min(260, width - 40));
      expect(canvas.height, `${width}x${height}: map height`).toBeGreaterThan(180);
      await expect(dialog.getByRole("button", { name: "تأكيد الموقع" })).toBeVisible();
      await attachShot(page, testInfo, `responsive-${width}x${height}`);
    }
    await attachJson(testInfo, "responsive.json", report);
  });

  test("the pre-login pages never load the map engine, its worker or any map request", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const urls: string[] = [];
    page.on("request", (request) => urls.push(request.url()));
    for (const route of ["/", "/login", "/register"]) {
      await page.goto(route, { waitUntil: "load" });
      await settle(page, 1500);
    }
    await context.close();
    const mapRelated = urls.filter((url) => /maplibre|pmtiles|map-renderer|jenan-map|\/api\/jenan-map/i.test(url));
    await evidence("prelogin-requests.json", JSON.stringify({ requests: urls.length, mapRelated }, null, 2));
    expect(urls.length).toBeGreaterThan(10);
    expect(mapRelated).toEqual([]);
  });

  test("an unpublished release is reachable by nobody who is not an administrator", async ({ page }) => {
    const { queryE2E } = await import("./identity-fixture");
    const style = (await queryE2E<{ id: string }>("SELECT id FROM jenan_map.artifact WHERE \"releaseId\" = $1 AND kind = 'style'", [state.b.id])).rows[0];
    expect(style, "the unpublished release has a style artifact").toBeTruthy();
    const probes: Array<[string, number[]]> = [
      [`/api/admin/jenan-map/preview?releaseId=${state.b.id}`, [403]],
      [`/api/admin/jenan-map/releases/${state.b.id}/glyphs/x/0-255.pbf`, [403]],
      [`/api/admin/jenan-map/artifacts/${style.id}`, [403]],
      [`/api/jenan-map/releases/${state.b.id}/glyphs/x/0-255.pbf`, [404]],
      [`/api/jenan-map/artifacts/${style.id}`, [404]],
    ];
    for (const [url, allowed] of probes) expect(allowed, url).toContain((await page.request.get(url)).status());

    await page.goto(`/jenan-map?preview=${state.b.id}`);
    await page.getByRole("button", { name: /اختيار موقع على الخريطة|تعديل الموقع/ }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("لا تملك صلاحية الوصول إلى هذا الإصدار.");
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(0);
  });
});
