import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { readdir, rename } from "node:fs/promises";
import path from "node:path";
import {
  attachJson, attachShot, baseUrl, enabled, evidence, expectNoFailedRequests, expectNoPolicyViolations, expectPaintedMap, expectPolicyEnforced, home, loadState, openPicker,
  pixels, recordPolicyViolations, removeMember, searchAndPick, seedMember, settle, summarize, warm, watchMapTraffic, RIYADH, type Member, type Provisioned,
} from "./jenan-map-real-support";

// BROWSER ACCEPTANCE of the Jenan PRO Map administration on REAL Saudi data: every screen, every release action with its confirmation, the
// effect on what a member sees, the exports, the full backup and the restore, the audit log and the measured health. Opt-in, and it changes the
// provisioned environment (a release is approved, published and rolled back; a backup and a restored candidate are created), so it runs after
// jenan-map-real.spec and ends with the same release published. See jenan-map-real-support.ts:
//   node ./node_modules/@playwright/test/cli.js test jenan-map-real-admin --project=jenan-map-real
test.skip(!enabled, "Opt-in: needs the provisioned real-data environment");
test.describe.configure({ mode: "serial" });

const STOPPED = "Jenan PRO Map قيد التحديث حاليًا، ستعود الخدمة قريبًا.";
let state: Provisioned;
let admin: Member;
let member: Member;

test.beforeAll(async ({ playwright }) => {
  await expectPolicyEnforced(playwright);
  state = await loadState();
  admin = await seedMember("admin");
  member = await seedMember("user");
  // Every route the run will open is compiled here, one after the other, while no browser is running: compiling the heavy administration pages
  // at the same time as a browser renders them is what exhausts the memory of a small machine.
  await warm(playwright, admin, [
    "/admin/jenan-map", ...sections.filter(([section]) => section !== "overview").map(([section]) => `/admin/jenan-map/${section}`),
    "/api/admin/jenan-map", "/api/admin/jenan-map/layers", "/api/admin/jenan-map/health", "/api/admin/jenan-map/backup",
    `/api/admin/jenan-map/preview?releaseId=${state.b.id}`, `/api/admin/jenan-map/search?releaseId=${state.b.id}&q=%D8%A7%D9%84%D8%B1%D9%8A%D8%A7%D8%B6`,
    `/api/admin/jenan-map/releases/${state.b.id}/glyphs/x/0-255.pbf`,
    `/api/admin/jenan-map/releases/${state.a.id}/layers/export?layerId=regions&format=csv`, "/jenan-map",
  ]);
  await warm(playwright, member, ["/jenan-map", "/api/jenan-map", "/api/jenan-map/location", `/api/jenan-map/preferences?releaseId=${state.a.id}`,
    `/api/jenan-map/search?releaseId=${state.a.id}&q=%D8%A7%D9%84%D8%B1%D9%8A%D8%A7%D8%B6`, "/dashboard"]);
});

test.afterAll(async () => {
  await removeMember(admin);
  await removeMember(member);
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "jenan_session", value: admin.token, url: baseURL! }]);
  await recordPolicyViolations(context);
});

test.afterEach(async ({ context }) => expectNoPolicyViolations(context));

const sections: Array<[string, string]> = [
  ["overview", "نظرة عامة"], ["versions", "الإصدارات"], ["updates", "التحديثات"], ["sources", "المصادر والتراخيص"], ["layers", "الطبقات"],
  ["storage", "التخزين والتصدير"], ["backup", "التصدير والنسخ الاحتياطي"], ["health", "الحالة التشغيلية"], ["audit", "سجل التدقيق"], ["settings", "الإعدادات"],
];

async function db() {
  const { queryE2E } = await import("./identity-fixture");
  return async <Row extends Record<string, unknown>>(text: string, values: unknown[] = []) => (await queryE2E<Row>(text, values)).rows;
}

async function openAdmin(page: Page, section: string, title: string) {
  await page.goto(section === "overview" ? "/admin/jenan-map" : `/admin/jenan-map/${section}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title, { timeout: 120_000 });
  await expect(page.locator("main[aria-busy=false]")).toBeVisible({ timeout: 120_000 });
}

/** Every release action asks for a reason and an explicit confirmation before the server is called. */
async function confirmAction(page: Page, reason?: string) {
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  if (reason !== undefined) await dialog.getByLabel(/سبب الإجراء/).fill(reason);
  await dialog.getByLabel("أؤكد مراجعة أثر هذا الإجراء.").check();
  await dialog.getByRole("button", { name: "تأكيد الإجراء" }).click();
}

/** The article of one release, found by its exact version: a restored candidate's version starts with the version of the release it came from. */
const release = (page: Page, version: string): Locator =>
  page.locator("article").filter({ has: page.locator("h3 bdi").filter({ hasText: new RegExp(`^${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) });

async function memberContext(browser: Browser) {
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 }, locale: "ar-SA" });
  await context.addCookies([{ name: "jenan_session", value: member.token, url: baseUrl }]);
  return { context, page: await context.newPage() };
}

async function luminance(png: Buffer) {
  const { data, width, height } = await pixels(png);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) total += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  return total / (width * height);
}

const mapCanvas = (scope: Locator | Page) => scope.locator('canvas[aria-label^="خريطة جنان برو"]');

test("the overview shows measured values that match the database, not placeholders", async ({ page }, testInfo) => {
  const sql = await db();
  const [truth] = await sql<{ datasets: number; layers: number; tiles: string }>(`SELECT
    (SELECT count(DISTINCT "layerId")::int FROM jenan_map.feature WHERE "releaseId" = $1::uuid AND "layerId" IS NOT NULL) AS datasets,
    (SELECT count(*)::int FROM jenan_map.release_layer WHERE "releaseId" = $1::uuid AND enabled AND status = 'ready' AND visibility = 'public' AND cardinality("styleLayerIds") > 0) AS layers,
    (SELECT "byteSize"::text FROM jenan_map.artifact WHERE "releaseId" = $1::uuid AND kind = 'pmtiles') AS tiles`, [state.a.id]);
  await openAdmin(page, "overview", "نظرة عامة");
  const tile = (title: string) => page.locator("section[aria-label='حالة الخريطة'] > *").filter({ has: page.getByRole("heading", { name: title }) }).locator("strong");
  await expect(tile("حالة التشغيل")).toHaveText("مفعّل");
  await expect(tile("إصدار الإنتاج")).toHaveText(state.a.version);
  await expect(tile("مجموعات البيانات في الإصدار المنشور")).toHaveText(String(truth.datasets));
  await expect(tile("الطبقات الفعالة")).toHaveText(String(truth.layers));
  await expect(tile("PostGIS")).toHaveText(/^متاح \(\d+\.\d+/);
  await expect(tile("التخزين وCDN")).toContainText("التخزين مهيأ");
  const size = Number(truth.tiles);
  const shown = (await tile("حجم ملف PMTiles المنشور").innerText()).trim();
  expect(shown, "the PMTiles size is the stored file's size").toMatch(/ج\.ب|م\.ب/);
  expect(Math.abs(parseFloat(shown) * (shown.includes("ج.ب") ? 1024 ** 3 : 1024 ** 2) - size) / size, "within the one decimal the screen shows").toBeLessThan(0.06);
  await attachShot(page, testInfo, "admin-overview", undefined, true);
});

test("all ten sections open with their own title and no error", async ({ page }, testInfo) => {
  for (const [section, title] of sections) {
    await openAdmin(page, section, title);
    await expect(page.getByRole("link", { name: title, exact: true }).first()).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("المصدر غير متاح")).toHaveCount(0);
    await attachShot(page, testInfo, `admin-section-${section}`, undefined, true);
  }
});

test("a release is previewed privately in its own (dark) style, with nothing failing and nothing leaking", async ({ page, browser }, testInfo) => {
  const hits = watchMapTraffic(page);
  const dialog = await openPicker(page, `/jenan-map?preview=${state.b.id}`);
  await expect(dialog.getByText("معاينة إصدار إداري")).toBeVisible();
  await expect(dialog.getByText(`الإصدار: ${state.b.version}`)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "معاينة للقراءة فقط" })).toBeDisabled();
  await settle(page, 2500);
  const picture = await mapCanvas(dialog).screenshot();
  await evidence("admin-preview-dark.png", picture);
  const painted = await expectPaintedMap(picture, "the preview map");
  const dark = await luminance(picture);
  expect(dark, "the release carries the dark style").toBeLessThan(0.4);
  // Searching works in preview, and it is the preview release's index that answers.
  const found = await searchAndPick(page, dialog, "الرياض", { box: RIYADH });
  expect(found.label).toBeTruthy();
  await settle(page, 2500);
  await attachShot(page, testInfo, "admin-preview-dark-searched");
  await attachJson(testInfo, "admin-preview.json", { luminance: dark, painted, traffic: summarize(hits) });
  expectNoFailedRequests(hits);

  // The member still gets the published (light) release, never the one under preview.
  const { context, page: seen } = await memberContext(browser);
  const manifest = await (await seen.request.get("/api/jenan-map")).json();
  expect(manifest.release.id).toBe(state.a.id);
  await context.close();
});

test("publish the dark release (approved here, or rolled back to), see it as a member, then roll back: every step confirmed, audited, and nothing deleted", async ({ page, browser }, testInfo) => {
  test.setTimeout(1_800_000);
  const sql = await db();
  const [before] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM jenan_map.release");
  const statuses = async () => Object.fromEntries((await sql<{ id: string; status: string }>("SELECT id, status FROM jenan_map.release WHERE id = ANY($1::uuid[])", [[state.a.id, state.b.id]])).map((row) => [row.id, row.status]));
  // Approving, publishing and rolling back each read every file of the release back before they commit, so they take minutes on real data.
  const settled = (expected: Record<string, string>) => expect.poll(statuses, { timeout: 900_000, intervals: [3000] }).toEqual(expected);
  await openAdmin(page, "versions", "الإصدارات");

  // A freshly provisioned environment holds the dark release as Ready, and it is approved and then published here. Once published it stays
  // Archived, and a release that was published before can be rolled back to, so the scenario can be repeated on the same environment.
  // A run that stopped half way leaves it Published, and the scenario carries on from there.
  const [{ status: darkStatus }] = await sql<{ status: string }>("SELECT status FROM jenan_map.release WHERE id = $1::uuid", [state.b.id]);
  expect(["Ready", "Archived", "Published"], "the dark release is Ready (fresh), Archived (published before) or Published (a run stopped half way)").toContain(darkStatus);
  const expectedActions = darkStatus === "Ready" ? ["rollback", "publish", "approve"] : darkStatus === "Archived" ? ["rollback", "rollback"] : ["rollback"];
  if (darkStatus === "Ready") {
    await release(page, state.b.version).getByRole("button", { name: "اعتماد", exact: true }).click();
    await attachShot(page, testInfo, "admin-confirm-dialog");
    await confirmAction(page, "اعتماد الإصدار الداكن بعد معاينته الإدارية");
    await settled({ [state.a.id]: "Published", [state.b.id]: "Approved" });
    await expect(release(page, state.b.version)).toContainText("معتمد", { timeout: 120_000 });
    await release(page, state.b.version).getByRole("button", { name: "نشر", exact: true }).click();
    await confirmAction(page, "نشر الإصدار الداكن للمستخدمين");
  } else if (darkStatus === "Archived") {
    await release(page, state.b.version).getByRole("button", { name: "استرجاع", exact: true }).click();
    await attachShot(page, testInfo, "admin-confirm-dialog");
    await confirmAction(page, "استرجاع الإصدار الداكن للتحقق منه");
  }
  await settled({ [state.a.id]: "Archived", [state.b.id]: "Published" });
  expect((await sql<{ id: string }>("SELECT \"publishedReleaseId\" AS id FROM jenan_map.runtime"))[0].id).toBe(state.b.id);
  await expect(release(page, state.b.version)).toContainText("منشور", { timeout: 120_000 });
  await attachShot(page, testInfo, "admin-versions-published", undefined, true);

  // A member now gets the dark release, atomically, with the old one kept.
  const seen = await memberContext(browser);
  const hits = watchMapTraffic(seen.page);
  const dialog = await openPicker(seen.page);
  await expect(dialog.getByText(`الإصدار: ${state.b.version}`)).toBeVisible();
  await settle(seen.page, 2500);
  const picture = await mapCanvas(dialog).screenshot();
  await evidence("member-sees-dark.png", picture);
  expect(await luminance(picture), "the published release is the dark one").toBeLessThan(0.4);
  expectNoFailedRequests(hits);

  // Roll back to the first release.
  await expect(release(page, state.a.version).getByRole("button", { name: "استرجاع", exact: true })).toBeEnabled({ timeout: 120_000 });
  await release(page, state.a.version).getByRole("button", { name: "استرجاع", exact: true }).click();
  await confirmAction(page, "استرجاع الإصدار الفاتح بعد التحقق من الإصدار الداكن");
  await settled({ [state.a.id]: "Published", [state.b.id]: "Archived" });
  await seen.page.reload();
  const again = await openPicker(seen.page);
  await expect(again.getByText(`الإصدار: ${state.a.version}`)).toBeVisible();
  await settle(seen.page, 2500);
  const light = await mapCanvas(again).screenshot();
  await evidence("member-sees-light-after-rollback.png", light);
  expect(await luminance(light), "the rollback restored the light release").toBeGreaterThan(0.6);
  await seen.context.close();

  // Nothing was deleted, and each step is in the audit log with who, when and why.
  expect((await sql<{ n: number }>("SELECT count(*)::int AS n FROM jenan_map.release"))[0].n).toBe(before.n);
  const audit = await sql<{ action: string; actorId: string; reason: string }>(`SELECT action, "actorId", metadata->>'reason' AS reason FROM jenan_map.audit
    WHERE action IN ('approve','publish','rollback') AND "releaseId" = ANY($1::uuid[]) ORDER BY "createdAt" DESC LIMIT $2`, [[state.a.id, state.b.id], expectedActions.length]);
  expect(audit.map((row) => row.action)).toEqual(expectedActions);
  expect(new Set(audit.map((row) => row.actorId))).toEqual(new Set([admin.id]));
  expect(audit.every((row) => row.reason.length >= 8)).toBe(true);
});

test("switching a layer off hides it from members and from search, and removes none of its data", async ({ page, browser }, testInfo) => {
  test.setTimeout(600_000);
  const sql = await db();
  const count = async () => (await sql<{ n: number }>("SELECT count(*)::int AS n FROM jenan_map.feature WHERE \"releaseId\" = $1::uuid AND \"layerId\" = 'pois'", [state.a.id]))[0].n;
  const rows = await count();
  expect(rows).toBeGreaterThan(0);
  const searchCategories = async (request: Page["request"]) => ((await (await request.get(`/api/jenan-map/search?releaseId=${state.a.id}&q=%D9%85%D8%B3%D8%AA%D8%B4%D9%81%D9%89`)).json()).results as Array<{ category: string }>).map((hit) => hit.category);
  const seen = await memberContext(browser);
  expect(await searchCategories(seen.page.request), "POIs are searchable while the layer is on").toContain("pois");

  await openAdmin(page, "layers", "الطبقات");
  const row = page.locator("tr").filter({ hasText: "المعالم والخدمات" });
  const enabledInDatabase = async () => (await sql<{ enabled: boolean }>("SELECT enabled FROM jenan_map.release_layer WHERE \"releaseId\" = $1::uuid AND \"layerId\" = 'pois'", [state.a.id]))[0].enabled;
  await row.getByRole("button", { name: "تعطيل", exact: true }).click();
  await confirmAction(page);
  await expect.poll(enabledInDatabase, { timeout: 120_000 }).toBe(false);
  expect(await count(), "switching a layer off deletes nothing").toBe(rows);
  expect(await searchCategories(seen.page.request), "a layer that is off is not searchable").not.toContain("pois");

  const dialog = await openPicker(seen.page);
  const pois = dialog.getByRole("group", { name: "طبقات الخريطة" }).getByRole("checkbox", { name: /المعالم والخدمات/ });
  await expect(pois).toBeDisabled();
  await expect(pois).not.toBeChecked();
  await attachShot(seen.page, testInfo, "layer-off-member-view");

  await expect(row.getByRole("button", { name: "تفعيل", exact: true })).toBeEnabled({ timeout: 120_000 });
  await row.getByRole("button", { name: "تفعيل", exact: true }).click();
  await confirmAction(page);
  await expect.poll(enabledInDatabase, { timeout: 120_000 }).toBe(true);
  expect(await searchCategories(seen.page.request), "searchable again").toContain("pois");
  await seen.context.close();
});

test("maintenance and disabled show members the exact message while the rest of the platform keeps working", async ({ page, browser }, testInfo) => {
  test.setTimeout(1_200_000);
  const sql = await db();
  const seen = await memberContext(browser);
  const stopped = async (message: string, name: string) => {
    await seen.page.goto("/jenan-map");
    await seen.page.getByRole("button", { name: /اختيار موقع على الخريطة|تعديل الموقع/ }).click();
    const dialog = seen.page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { level: 3 })).toHaveText(message);
    await expect(dialog.getByText("بقية خدمات المنصة تعمل كالمعتاد")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "تأكيد الموقع" })).toBeDisabled();
    await expect(mapCanvas(dialog)).toHaveCount(0);
    await attachShot(seen.page, testInfo, name);
    const dashboard = await seen.page.goto("/dashboard");
    expect(dashboard?.status(), "the rest of the platform answers").toBe(200);
    expect(new URL(seen.page.url()).pathname).toBe("/dashboard");
  };
  const setRuntime = async (status: "enabled" | "maintenance" | "disabled", reason: string, text?: string) => {
    await openAdmin(page, "settings", "الإعدادات");
    await page.getByLabel("حالة التشغيل").selectOption(status);
    if (status === "maintenance") {
      // The standard message is what the form starts with.
      if (text === undefined) await expect(page.getByLabel("رسالة الصيانة العربية")).toHaveValue(STOPPED);
      else await page.getByLabel("رسالة الصيانة العربية").fill(text);
    }
    await page.getByRole("button", { name: "مراجعة وتأكيد التغيير" }).click();
    await confirmAction(page, reason);
    // Enabling again reads every file of the published release back first, so the change lands minutes later on real data.
    await expect.poll(async () => (await sql<{ status: string }>("SELECT status FROM jenan_map.runtime"))[0].status, { timeout: 900_000, intervals: [3000] }).toBe(status);
    if (status === "maintenance") {
      await expect.poll(async () => (await sql<{ message: string }>("SELECT \"maintenanceMessage\" AS message FROM jenan_map.runtime"))[0].message, { timeout: 60_000 }).toBe(text ?? STOPPED);
    }
  };

  await setRuntime("maintenance", "إيقاف مؤقت لاختبار رسالة الصيانة القياسية");
  await stopped(STOPPED, "member-maintenance-standard");

  const custom = "نعود بعد تحديث طبقات المعالم ظهر الخميس.";
  await setRuntime("maintenance", "إيقاف مؤقت مع رسالة مخصصة للمستخدمين", custom);
  await stopped(custom, "member-maintenance-custom");

  await setRuntime("disabled", "تعطيل الخريطة لاختبار الرسالة القياسية");
  await stopped(STOPPED, "member-disabled");

  await setRuntime("enabled", "إعادة تشغيل الخريطة بعد اختبار الإيقاف");
  await seen.page.goto("/jenan-map");
  const dialog = await openPicker(seen.page);
  await expect(dialog.getByText(`الإصدار: ${state.a.version}`)).toBeVisible();
  await seen.context.close();
});

test("a layer exports as GeoJSON, JSON, CSV and GeoPackage with the same real features and the licence", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const sql = await db();
  const [{ n }] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM jenan_map.feature WHERE \"releaseId\" = $1::uuid AND \"layerId\" = 'regions'", [state.a.id]);
  expect(n).toBeGreaterThan(0);
  await openAdmin(page, "backup", "التصدير والنسخ الاحتياطي");
  const row = page.locator("tr").filter({ hasText: "المناطق" }).filter({ has: page.getByRole("link", { name: "GeoJSON" }) });
  await expect(row).toBeVisible({ timeout: 120_000 });
  await attachShot(page, testInfo, "admin-export-panel", undefined, true);
  const get = async (target: Locator, format: string) => {
    const response = await page.request.get((await target.getByRole("link", { name: format, exact: true }).getAttribute("href"))!);
    expect(response.status(), `${format}: ${response.status() === 200 ? "" : (await response.text()).slice(0, 300)}`).toBe(200);
    return response.body();
  };

  const geojson = JSON.parse((await get(row, "GeoJSON")).toString("utf8"));
  expect(geojson.type).toBe("FeatureCollection");
  expect(geojson.features).toHaveLength(n);
  expect(JSON.stringify(geojson)).toMatch(/ODbL|OpenStreetMap|geoBoundaries|CC BY/);
  const json = JSON.parse((await get(row, "JSON")).toString("utf8"));
  expect(json.features).toHaveLength(n);
  expect(json.license, "the licence travels with the data").toBeTruthy();
  const csv = await get(row, "CSV");
  expect([...csv.subarray(0, 3)], "UTF-8 byte order mark, so Arabic opens correctly in a spreadsheet").toEqual([0xef, 0xbb, 0xbf]);
  const lines = csv.toString("utf8").replace(/^\uFEFF/, "").trim().split("\r\n");
  expect(lines.length - 1).toBe(n);
  const gpkg = await get(row, "GeoPackage");
  expect(gpkg.subarray(0, 15).toString("latin1")).toBe("SQLite format 3");
  expect(gpkg.subarray(68, 72).toString("latin1"), "the SQLite application id of a GeoPackage").toBe("GPKG");

  // The region names of the source are English; the real Arabic names are in the places layer, and they must survive the export.
  const places = page.locator("tr").filter({ hasText: "المدن والأماكن" }).filter({ has: page.getByRole("link", { name: "CSV" }) });
  const placesCsv = (await get(places, "CSV")).toString("utf8");
  expect(placesCsv.charCodeAt(0), "byte order mark").toBe(0xfeff);
  expect(placesCsv).toMatch(/[\u0600-\u06FF]{3,}/);
  await attachJson(testInfo, "export-checked.json", { layer: "regions", features: n, geojsonBytes: JSON.stringify(geojson).length, csvBytes: csv.length, gpkgBytes: gpkg.length, placesCsvBytes: placesCsv.length });
});

test("a full backup is created and validated, and restored as a new candidate that opens in private preview", async ({ page }, testInfo) => {
  test.setTimeout(2_400_000);
  const sql = await db();
  const [{ n: before }] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM jenan_map.release");
  await openAdmin(page, "backup", "التصدير والنسخ الاحتياطي");
  await page.locator("main select").selectOption(state.a.id);
  await page.getByRole("button", { name: "إنشاء نسخة احتياطية كاملة" }).click();
  await confirmAction(page);
  await expect(page.getByText(/أُنشئت نسخة احتياطية كاملة وتحققت من كل ملف فيها/)).toBeVisible({ timeout: 1_200_000 });
  const folders = (await readdir(path.join(home, "backups"))).sort();
  expect(folders.length).toBeGreaterThan(0);
  const folder = folders.at(-1)!;
  await attachShot(page, testInfo, "admin-backup-created", undefined, true);

  const backupRow = page.locator("tr").filter({ hasText: folder });
  await backupRow.getByRole("button", { name: "تحقق", exact: true }).click();
  await expect(page.getByText(new RegExp(`النسخة ${folder} سليمة وكاملة`))).toBeVisible({ timeout: 1_200_000 });
  // Restoring never writes to production: it makes a new candidate, validated first and confirmed by the administrator.
  await backupRow.getByRole("button", { name: "استعادة كإصدار مرشح" }).click();
  await confirmAction(page);
  await expect(page.getByText(/أُنشئ الإصدار المرشح/)).toBeVisible({ timeout: 1_800_000 });
  expect((await sql<{ n: number }>("SELECT count(*)::int AS n FROM jenan_map.release"))[0].n).toBe(before + 1);
  const [candidate] = await sql<{ id: string; version: string; status: string }>("SELECT id, version, status FROM jenan_map.release ORDER BY \"createdAt\" DESC LIMIT 1");
  expect(["Ready", "Approved"], "a restored candidate waits for review; it is never published").toContain(candidate.status);
  expect((await sql<{ id: string }>("SELECT \"publishedReleaseId\" AS id FROM jenan_map.runtime"))[0].id, "production did not move").toBe(state.a.id);

  // The restored candidate is previewed privately, with real data, before anyone could approve it.
  const hits = watchMapTraffic(page);
  const dialog = await openPicker(page, `/jenan-map?preview=${candidate.id}`);
  await expect(dialog.getByText(`الإصدار: ${candidate.version}`)).toBeVisible();
  await settle(page, 2500);
  await expectPaintedMap(await mapCanvas(dialog).screenshot(), "the restored candidate");
  await searchAndPick(page, dialog, "النرجس", { box: RIYADH, category: "places" });
  await settle(page, 2500);
  await attachShot(page, testInfo, "restored-candidate-preview");
  expectNoFailedRequests(hits);
  await attachJson(testInfo, "restore.json", { backup: folder, candidate, traffic: summarize(hits) });
});

test("the health section measures: real values, a deep check, and a lost file is caught", async ({ page }, testInfo) => {
  test.setTimeout(1_800_000);
  const sql = await db();
  const layers = await sql<{ layerId: string; features: number }>("SELECT \"layerId\", count(*)::int AS features FROM jenan_map.feature WHERE \"releaseId\" = $1::uuid GROUP BY 1 ORDER BY 1", [state.a.id]);
  const [schema] = await sql<{ storageKey: string }>("SELECT \"storageKey\" FROM jenan_map.artifact WHERE \"releaseId\" = $1::uuid AND kind = 'schema'", [state.a.id]);
  const verifications = async () => (await sql<{ n: number }>("SELECT count(*)::int AS n FROM jenan_map.audit WHERE action = 'health.verify' AND \"releaseId\" = $1::uuid", [state.a.id]))[0].n;
  const status = page.locator("[data-health-status]");

  await openAdmin(page, "health", "الحالة التشغيلية");
  await expect(status).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("row", { name: /^قاعدة البيانات / })).toContainText(/\d+ م\.ث/);
  await expect(page.getByRole("row", { name: /^PostGIS / })).toContainText(/\d+\.\d+/);
  // The files table has a column headed «في التخزين», so the row is matched by the start of its name.
  await expect(page.getByRole("row", { name: /^التخزين / })).toContainText("مجلد ملفات خاص");
  for (const layer of layers) await expect(page.getByRole("row", { name: new RegExp(`^${layer.layerId} `) })).toContainText(layer.features.toLocaleString("en-US"));
  await expect(page.getByText("موجود بالحجم المسجل").first()).toBeVisible();
  await expect(page.getByText("غير مقاس هنا").first()).toBeVisible();
  await attachShot(page, testInfo, "admin-health-measured", undefined, true);

  // Nothing is called healthy until the files themselves were read back: the deep check does that.
  const before = await verifications();
  if (before === 0) await expect(status).not.toHaveAttribute("data-health-status", "ok");
  await page.getByRole("button", { name: "فحص عميق لملفات الإصدار المنشور" }).click();
  await expect(page.getByText(/اجتاز الفحص العميق للإصدار/)).toBeVisible({ timeout: 1_200_000 });
  await expect(status).toHaveAttribute("data-health-status", "ok");
  expect(await verifications()).toBe(before + 1);
  await attachShot(page, testInfo, "admin-health-verified", undefined, true);

  // A file that disappears from storage is seen on the next measurement.
  const file = path.join(home, "storage", schema.storageKey);
  await rename(file, `${file}.away`);
  try {
    await page.getByRole("button", { name: "إعادة القياس" }).click();
    await expect(status).toHaveAttribute("data-health-status", "failed", { timeout: 60_000 });
    await expect(page.getByText("مفقود")).toBeVisible();
    await attachShot(page, testInfo, "admin-health-missing-file", undefined, true);
  } finally {
    await rename(`${file}.away`, file);
  }
  await page.getByRole("button", { name: "إعادة القياس" }).click();
  await expect(status).toHaveAttribute("data-health-status", "ok", { timeout: 60_000 });
});

test("the audit log lists who did what, to which release, and why", async ({ page }, testInfo) => {
  const sql = await db();
  // The screen shows the latest 100 records of an audit log that grows with every action, so it is compared with the database
  // rather than assuming which actions fall inside that window.
  const window = await sql<{ action: string; actorId: string; reason: string | null }>(`SELECT action, "actorId", metadata->>'reason' AS reason FROM jenan_map.audit ORDER BY "createdAt" DESC LIMIT 100`);
  expect(window.length).toBeGreaterThan(10);
  await openAdmin(page, "audit", "سجل التدقيق");
  const table = page.getByRole("region", { name: /الوقت/ });
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr");
  await expect(rows, "the screen lists the same window").toHaveCount(window.length);
  for (const entry of window.slice(0, 12)) {
    await expect(rows.filter({ has: page.getByText(entry.action, { exact: true }) }).filter({ hasText: entry.actorId }).first(), `the record of ${entry.action}`).toBeVisible();
  }
  // The reason an administrator typed for a change is shown next to it.
  const changed = window.find((entry) => entry.action === "runtime" && entry.reason);
  expect(changed, "a recent runtime change with its reason").toBeTruthy();
  await expect(table.getByText(changed!.reason!, { exact: true }).first()).toBeVisible();
  await attachShot(page, testInfo, "admin-audit", undefined, true);
});

test("only administrators reach the administration: members are refused every admin page and API", async ({ browser }) => {
  const seen = await memberContext(browser);
  for (const route of ["/api/admin/jenan-map", "/api/admin/jenan-map/layers", "/api/admin/jenan-map/health", "/api/admin/jenan-map/backup", "/api/admin/jenan-map/export"]) {
    expect((await seen.page.request.get(route)).status(), route).toBe(403);
  }
  expect((await seen.page.request.post("/api/admin/jenan-map/health", { data: { action: "verify-published" } })).status()).toBe(403);
  await seen.page.goto("/admin/jenan-map");
  await expect(seen.page.getByRole("heading", { level: 1, name: "نظرة عامة" })).toHaveCount(0);
  await seen.context.close();
});
