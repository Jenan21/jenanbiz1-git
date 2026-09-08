import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("stores files for their owner and prevents other users from reading them", async ({ baseURL, browser, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const suffix = Date.now();
  let ownerId: string | undefined;
  let otherUserId: string | undefined;
  let otherContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    const ownerRegistration = await page.request.post("/api/auth/register", {
      headers: { origin: baseURL },
      data: { displayName: "File Owner", countryCode: "SA", email: `files-owner-${suffix}@example.test`, password: "StrongPass123!", locale: "en", language: "en" },
    });
    expect(ownerRegistration.status()).toBe(201);
    ownerId = (await ownerRegistration.json()).user.id as string;

    const fileBytes = Buffer.from("Jenan BIZ file acceptance", "utf8");
    const upload = await page.request.post("/api/files", {
      headers: { origin: baseURL },
      multipart: { file: { name: "acceptance.txt", mimeType: "text/plain", buffer: fileBytes } },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const uploaded = await upload.json() as { file: { id: string; fileName: string; sizeBytes: string } };
    expect(uploaded.file).toMatchObject({ fileName: "acceptance.txt", sizeBytes: String(fileBytes.length) });

    const listed = await page.request.get("/api/files");
    expect(listed.status()).toBe(200);
    expect((await listed.json()).files).toEqual(expect.arrayContaining([expect.objectContaining({ id: uploaded.file.id })]));

    const download = await page.request.get(`/api/files/${uploaded.file.id}`);
    expect(download.status()).toBe(200);
    expect(await download.body()).toEqual(fileBytes);

    otherContext = await browser.newContext({ baseURL });
    const otherRegistration = await otherContext.request.post("/api/auth/register", {
      headers: { origin: baseURL },
      data: { displayName: "Other User", countryCode: "SA", email: `files-other-${suffix}@example.test`, password: "StrongPass123!", locale: "en", language: "en" },
    });
    expect(otherRegistration.status()).toBe(201);
    otherUserId = (await otherRegistration.json()).user.id as string;
    expect((await otherContext.request.get(`/api/files/${uploaded.file.id}`)).status()).toBe(404);

    const deleted = await page.request.delete(`/api/files/${uploaded.file.id}`, { headers: { origin: baseURL } });
    expect(deleted.status()).toBe(204);
    expect((await page.request.get(`/api/files/${uploaded.file.id}`)).status()).toBe(404);
  } finally {
    await otherContext?.close();
    if (otherUserId) await queryE2E('DELETE FROM "User" WHERE id = $1', [otherUserId]);
    if (ownerId) await queryE2E('DELETE FROM "User" WHERE id = $1', [ownerId]);
  }
});