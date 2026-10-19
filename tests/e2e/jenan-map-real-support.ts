import { expect, type APIRequestContext, type Locator, type Page, type PlaywrightWorkerArgs, type Request, type TestInfo } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Shared by the browser acceptance of Jenan PRO Map on REAL Saudi data (jenan-map-real*.spec.ts). Opt-in: it needs the environment provisioned by
// tests/integration/jenan-map-provision-local.integration.test.ts and a server started against it (docs/jenan-map.md).
export const enabled = process.env.RUN_JENAN_MAP_REAL_E2E === "1";
export const home = process.env.JENAN_MAP_LOCAL_RUN ?? "";
export const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3101";

export type Provisioned = { a: { id: string; version: string }; b: { id: string; version: string } };
export type Found = { id: string; label: string; category: string; latitude: number; longitude: number };
export type Hit = { path: string; kind: string; status: number; bytes: number };
export type Member = { email: string; token: string; id: string };

export const RIYADH = { west: 46.2, east: 47.3, south: 24.3, north: 25.2 };
export const inside = (box: typeof RIYADH, hit: Pick<Found, "latitude" | "longitude">) =>
  hit.longitude >= box.west && hit.longitude <= box.east && hit.latitude >= box.south && hit.latitude <= box.north;

export const loadState = async () => JSON.parse(await readFile(path.join(home, "state.json"), "utf8")) as Provisioned;

/** Results worth keeping (screenshots, measured traffic) go next to the provisioned environment, outside the repository. */
export async function evidence(name: string, body: string | Buffer) {
  const folder = path.join(home, "evidence");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, name), body);
}

export async function seedMember(role: "user" | "admin"): Promise<Member> {
  const fixtures = await import("./identity-fixture");
  const { e2eIdentity } = await import("./test-identities");
  const email = e2eIdentity[role].email;
  if (role === "admin") await fixtures.seedE2EAdmin();
  else await fixtures.seedE2EUser();
  const token = await fixtures.createE2ESession(email);
  const id = (await fixtures.queryE2E<{ id: string }>('SELECT id FROM "User" WHERE email = $1', [email])).rows[0].id;
  return { email, token, id };
}

export async function removeMember(member?: Member) {
  if (!member) return;
  const { queryE2E } = await import("./identity-fixture");
  await queryE2E('DELETE FROM jenan_map.saved_location WHERE "userId" = $1', [member.id]);
  await queryE2E('DELETE FROM jenan_map.preference WHERE "userId" = $1', [member.id]);
  await queryE2E('DELETE FROM "User" WHERE email = $1', [member.email]);
}

/** The dev server compiles a route on its first request; doing that first keeps the timing of the tests about the map, not the compiler. */
export async function warm(playwright: PlaywrightWorkerArgs["playwright"], member: Member, routes: string[]) {
  const context: APIRequestContext = await playwright.request.newContext({ baseURL: baseUrl, extraHTTPHeaders: { cookie: `jenan_session=${member.token}` } });
  for (const route of routes) await context.get(route, { timeout: 180_000 });
  await context.dispose();
}

export function kindOf(pathname: string) {
  if (/\/pmtiles\//.test(pathname)) return "tiles";
  if (/\/glyphs\//.test(pathname)) return "glyphs";
  if (/\/sprites?\//.test(pathname)) return "sprite";
  if (/\/search$/.test(pathname)) return "search";
  if (/\/location$/.test(pathname)) return "location";
  if (/\/preferences$/.test(pathname)) return "preferences";
  if (/\/validate$/.test(pathname)) return "validate";
  if (/\/artifacts\//.test(pathname)) return "artifact";
  return "api";
}

/** Everything the page asks of the map API, with its outcome. A failed request is recorded with status 0. */
export function watchMapTraffic(page: Page) {
  const hits: Hit[] = [];
  const mapApi = /\/api\/(?:admin\/)?jenan-map(?:\/|$)/;
  page.on("requestfailed", (request: Request) => {
    const { pathname } = new URL(request.url());
    // A request the page itself cancelled (a tile that scrolled out of view, a superseded search) is not a failure.
    if (mapApi.test(pathname) && !/ERR_ABORTED/.test(request.failure()?.errorText ?? "")) hits.push({ path: pathname, kind: kindOf(pathname), status: 0, bytes: 0 });
  });
  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (mapApi.test(pathname)) hits.push({ path: pathname, kind: kindOf(pathname), status: response.status(), bytes: Number(response.headers()["content-length"] ?? 0) });
  });
  return hits;
}

export const summarize = (hits: Hit[]) => {
  const kinds: Record<string, { requests: number; bytes: number; statuses: Record<string, number> }> = {};
  for (const hit of hits) {
    const kind = (kinds[hit.kind] ??= { requests: 0, bytes: 0, statuses: {} });
    kind.requests++;
    kind.bytes += hit.bytes;
    kind.statuses[hit.status] = (kind.statuses[hit.status] ?? 0) + 1;
  }
  return { total: hits.length, kinds };
};

/** No asset or API request of the map may fail: not a tile, a glyph range, the style, a search or a location call. */
export function expectNoFailedRequests(hits: Hit[]) {
  expect(hits.filter((hit) => hit.status === 0 || hit.status >= 400), JSON.stringify(summarize(hits))).toEqual([]);
}

export async function attachShot(page: Page, testInfo: TestInfo, name: string, target?: Locator, fullPage = false) {
  const body = await (target ?? page).screenshot(target ? undefined : { fullPage });
  await testInfo.attach(name, { body, contentType: "image/png" });
  await evidence(`${name}.png`, body);
  return body;
}

export async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  const body = JSON.stringify(value, null, 2);
  await testInfo.attach(name, { body, contentType: "application/json" });
  await evidence(name, body);
}

/** Opens the location picker and waits until the real map has loaded its style and first tiles. */
export async function openPicker(page: Page, url = "/jenan-map") {
  await page.goto(url);
  const trigger = page.getByRole("button", { name: /اختيار موقع على الخريطة|تعديل الموقع/ });
  await expect(trigger).toBeEnabled({ timeout: 120_000 });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('canvas[aria-label^="خريطة جنان برو"]')).toBeVisible({ timeout: 120_000 });
  return dialog;
}

/** Types a query, takes the first result inside `box` (when given) from the real search response and clicks it. */
export async function searchAndPick(page: Page, dialog: Locator, query: string, options: { box?: typeof RIYADH; category?: string } = {}) {
  const response = page.waitForResponse((r) => /\/api\/(?:admin\/)?jenan-map\/search/.test(r.url()) && r.status() === 200);
  await dialog.getByLabel("البحث عن موقع").fill(query);
  const found = (await (await response).json()).results as Found[];
  expect(found.length, `search "${query}" returned results`).toBeGreaterThan(0);
  const index = found.findIndex((hit) => (!options.box || inside(options.box, hit)) && (!options.category || hit.category === options.category));
  expect(index, `search "${query}" has a result${options.box ? " inside the area" : ""}${options.category ? ` of ${options.category}` : ""}: ${JSON.stringify(found.map((hit) => [hit.label, hit.category]))}`).toBeGreaterThanOrEqual(0);
  await dialog.getByRole("list", { name: "نتائج البحث" }).locator("li").nth(index).getByRole("button").click();
  return found[index];
}

export async function expectDraftAt(dialog: Locator, hit: Pick<Found, "latitude" | "longitude">) {
  await expect(dialog.getByLabel("خط العرض")).toHaveValue(String(hit.latitude));
  await expect(dialog.getByLabel("خط الطول")).toHaveValue(String(hit.longitude));
  await expect(dialog.locator("[class*=draftBadge]")).toContainText(`${hit.latitude.toFixed(6)}, ${hit.longitude.toFixed(6)}`);
}

/** Where the page is after the camera stopped: the viewport that "حفظ إعدادات العرض" writes is the map's own centre and zoom. */
export async function currentZoom(page: Page, dialog: Locator) {
  const saved = page.waitForRequest((request) => /\/api\/jenan-map\/preferences/.test(request.url()) && request.method() === "PUT");
  await dialog.getByRole("button", { name: "حفظ إعدادات العرض" }).click();
  const body = JSON.parse((await saved).postData() ?? "{}");
  await expect(dialog.getByText("تم حفظ إعدادات العرض")).toBeVisible();
  return body.viewport as { latitude: number; longitude: number; zoom: number };
}

/** MapLibre draws 512-pixel tiles: the ground resolution of a pixel at a zoom level and latitude. */
export const metersPerPixel = (zoom: number, latitude: number) => (40_075_016.686 / (512 * 2 ** zoom)) * Math.cos((latitude * Math.PI) / 180);

/** Lets the camera animation, the tiles and the labels settle before a picture is taken. */
export async function settle(page: Page, milliseconds = 1600) {
  await page.waitForTimeout(milliseconds);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
}

export async function pixels(png: Buffer) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}

/**
 * How much structure a picture of the map holds: the share of neighbouring pixels that differ clearly (roads, labels, shorelines) and how many
 * distinct colours it uses. A map that did not paint (a collapsed container, a lost context) is the flat panel colour with only the attribution
 * strip: about 0.4 % edges and 16 colours, against 5 % and 270 or more for the real light and dark maps. The dark basemap is close to the panel's
 * own colour, so measuring distance from that colour would call it empty.
 */
export async function mapDetail(png: Buffer) {
  const { data, width, height } = await pixels(png);
  let edges = 0;
  let pairs = 0;
  const colors = new Set<number>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const j = i + 4;
      if (Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]) > 30) edges++;
      pairs++;
      if ((x & 3) === 0 && (y & 3) === 0) colors.add(((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3));
    }
  }
  return { edgeShare: edges / pairs, colors: colors.size };
}

export async function expectPaintedMap(png: Buffer, what = "the map") {
  const detail = await mapDetail(png);
  expect(detail.edgeShare, `${what} has roads, labels and shorelines, not an empty panel`).toBeGreaterThan(0.02);
  expect(detail.colors, `${what} uses many colours`).toBeGreaterThan(100);
  return detail;
}

/** The share of pixels that differ visibly between two pictures of the same size. */
export async function changedShare(first: Buffer, second: Buffer) {
  const [a, b] = await Promise.all([pixels(first), pixels(second)]);
  expect([b.width, b.height]).toEqual([a.width, a.height]);
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 60) changed++;
  }
  return changed / (a.width * a.height);
}

/**
 * Measures the analysis ring in a picture of the map: the cyan dashed line is found by colour around the marker, and the radius that most
 * of it sits at is its radius in pixels. `coverage` is the share of directions (5 degree steps) in which the ring is drawn.
 */
export async function measureRing(png: Buffer, center: { x: number; y: number }) {
  const { data, width, height } = await pixels(png);
  const found: { distance: number; angle: number }[] = [];
  const histogram = new Map<number, number>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (!(g > 170 && g - r > 110 && b - r > 90)) continue;
      const distance = Math.hypot(x - center.x, y - center.y);
      // The marker and its glow are not the ring.
      if (distance < 40) continue;
      found.push({ distance, angle: Math.atan2(y - center.y, x - center.x) });
      const bin = Math.round(distance / 2);
      histogram.set(bin, (histogram.get(bin) ?? 0) + 1);
    }
  }
  let best = { bin: 0, score: 0 };
  for (const [bin, count] of histogram) {
    const score = count + (histogram.get(bin - 1) ?? 0) + (histogram.get(bin + 1) ?? 0);
    if (score > best.score) best = { bin, score };
  }
  const radius = best.bin * 2;
  const onRing = found.filter((pixel) => Math.abs(pixel.distance - radius) <= 4);
  const directions = new Set(onRing.map((pixel) => Math.floor(((pixel.angle + Math.PI) / (2 * Math.PI)) * 72)));
  return { radius, pixels: onRing.length, candidates: found.length, share: found.length ? onRing.length / found.length : 0, coverage: directions.size / 72 };
}
