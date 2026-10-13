import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test.setTimeout(90_000);

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const appleConfigured = Boolean(
  process.env.APPLE_CLIENT_ID &&
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    process.env.APPLE_PRIVATE_KEY,
);
const hasSecret = Boolean(process.env.AUTH_SECRET);
const enabled = {
  google: googleConfigured && hasSecret,
  apple: appleConfigured && hasSecret,
} as const;

const copy = {
  ar: {
    soon: "قريباً",
    unavailable: "الدخول عبر Google غير مفعّل بعد.",
    denied: "تم إلغاء الدخول عبر Google.",
    failed: "تعذّر إكمال الدخول عبر Google. حاول مجدداً.",
  },
  en: {
    soon: "Soon",
    unavailable: "Google sign-in isn't enabled yet.",
    denied: "Google sign-in was cancelled.",
    failed: "Couldn't complete Google sign-in. Try again.",
  },
} as const;

async function setLocale(context: BrowserContext, locale: "ar" | "en", baseURL: string | undefined) {
  await context.addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://127.0.0.1:3101" }]);
}

async function openPanel(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.locator("#access-panel")).toBeVisible();
}

for (const locale of ["ar", "en"] as const) {
  for (const entry of ["login", "register"] as const) {
    test(`${entry} ${locale} offers Google and Apple and reflects what is configured`, async ({ context, page }, testInfo) => {
      await setLocale(context, locale, testInfo.project.use.baseURL);
      await openPanel(page, `/${entry}?next=%2Fprojects`);

      const group = page.locator(".auth-social");
      await expect(group).toBeVisible();
      await expect(group.locator(".auth-social__btn")).toHaveCount(2);
      for (const provider of ["google", "apple"] as const) {
        const button = group.locator(`[data-provider="${provider}"]`);
        await expect(button).toBeVisible();
        await expect(button).toContainText(provider === "google" ? "Google" : "Apple");
        if (enabled[provider]) {
          await expect(button).toHaveJSProperty("tagName", "A");
          await expect(button).toHaveAttribute(
            "href",
            `/api/auth/oauth/${provider}/start?from=${entry}&next=%2Fprojects`,
          );
        } else {
          await expect(button).toBeDisabled();
          await expect(button).toContainText(copy[locale].soon);
        }
      }

      // the row sits fully inside the card, between the divider and the other-panel link
      const boxes = await page.evaluate(() => {
        const rect = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
        const panel = rect("#access-panel");
        const social = rect(".auth-social");
        const alt = rect(".access-page__alt-link");
        const or = rect(".access-page__or");
        return {
          insidePanel: social.left >= panel.left && social.right <= panel.right && alt.bottom <= panel.bottom,
          ordered: or.bottom <= social.top + 1 && social.bottom <= alt.top + 1,
          inViewport: panel.top >= 0 && panel.bottom <= innerHeight,
        };
      });
      expect(boxes).toEqual({ insidePanel: true, ordered: true, inViewport: true });
    });
  }
}

test("an unknown provider is a 404", async ({ request }) => {
  expect((await request.get("/api/auth/oauth/facebook/start", { maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get("/api/auth/oauth/facebook/callback", { maxRedirects: 0 })).status()).toBe(404);
});

test("a provider that is not configured returns the visitor to the panel with a clear message", async ({ context, page }, testInfo) => {
  test.skip(enabled.google, "Google is configured in this run");
  await setLocale(context, "en", testInfo.project.use.baseURL);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/api/auth/oauth/google/start?from=register&next=%2Fprojects");
  await expect(page).toHaveURL(/\/register\?oauth_error=unavailable&oauth_provider=google&next=%2Fprojects$/);
  await expect(page.locator(".auth-hint[data-state=error]")).toHaveText(copy.en.unavailable);
});

test.describe("with Google configured", () => {
  test.skip(!enabled.google, "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and AUTH_SECRET to run these");

  /** Calls the start route without following the redirect, so nothing ever leaves the test server. */
  async function start(context: BrowserContext, query: string) {
    const response = await context.request.get(`/api/auth/oauth/google/start?${query}`, { maxRedirects: 0 });
    return { response, location: response.headers()["location"] ?? "" };
  }

  test("the button navigates to the start route", async ({ context, page }, testInfo) => {
    await setLocale(context, "en", testInfo.project.use.baseURL);
    await page.route("**/api/auth/oauth/google/start**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<h1>started</h1>" }),
    );
    await openPanel(page, "/login?next=%2Fprojects");
    await page.locator('.auth-social__btn[data-provider="google"]').click();
    await expect(page).toHaveURL(/\/api\/auth\/oauth\/google\/start\?from=login&next=%2Fprojects$/);
  });

  test("starting sign-in redirects to Google with state, nonce and PKCE and sets a signed transaction cookie", async ({ context }, testInfo) => {
    await setLocale(context, "en", testInfo.project.use.baseURL);
    const { response, location } = await start(context, "from=login&next=%2Fprojects");
    expect(response.status()).toBe(302);
    expect(response.headers()["cache-control"]).toBe("no-store");

    const target = new URL(location);
    expect(target.origin + target.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(target.searchParams.get("client_id")).toBe(process.env.GOOGLE_CLIENT_ID);
    expect(target.searchParams.get("response_type")).toBe("code");
    expect(target.searchParams.get("scope")).toBe("openid email profile");
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(target.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(target.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(target.searchParams.get("nonce")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(target.searchParams.get("redirect_uri")).toMatch(/\/api\/auth\/oauth\/google\/callback$/);

    const cookie = (await context.cookies()).find((entry) => entry.name === "jenan_oauth");
    expect(cookie).toMatchObject({ httpOnly: true, path: "/api/auth/oauth", sameSite: "Lax" });
    // the PKCE verifier lives only in the signed cookie, never in the URL
    const verifier = JSON.parse(Buffer.from(cookie!.value.split(".")[0], "base64url").toString()).verifier as string;
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location).not.toContain(verifier);
  });

  test("a cancelled sign-in comes back to the panel with a readable message and clears the transaction", async ({ context, page }, testInfo) => {
    await setLocale(context, "en", testInfo.project.use.baseURL);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { location } = await start(context, "from=login&next=%2Fprojects");
    const state = new URL(location).searchParams.get("state")!;

    await page.goto(`/api/auth/oauth/google/callback?error=access_denied&state=${state}`);
    await expect(page).toHaveURL(/\/login\?oauth_error=denied&oauth_provider=google&next=%2Fprojects$/);
    await expect(page.locator(".auth-status[data-state=error]")).toHaveText(copy.en.denied);
    const names = (await context.cookies()).map((entry) => entry.name);
    expect(names).not.toContain("jenan_oauth");
    expect(names).not.toContain("jenan_session");
  });

  test("the transaction is single-use: replaying a callback after it completed is refused", async ({ context, page }, testInfo) => {
    await setLocale(context, "en", testInfo.project.use.baseURL);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { location } = await start(context, "from=login");
    const state = new URL(location).searchParams.get("state")!;
    await page.goto(`/api/auth/oauth/google/callback?error=access_denied&state=${state}`);
    await expect(page).toHaveURL(/oauth_error=denied/);
    await page.goto(`/api/auth/oauth/google/callback?error=access_denied&state=${state}`);
    await expect(page).toHaveURL(/\/login\?oauth_error=failed&oauth_provider=google$/);
  });

  test("a callback with a forged state or no transaction never signs anyone in", async ({ context, page }, testInfo) => {
    await setLocale(context, "en", testInfo.project.use.baseURL);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await start(context, "from=login");
    await page.goto("/api/auth/oauth/google/callback?code=stolen-code&state=forged");
    await expect(page).toHaveURL(/\/login\?oauth_error=failed&oauth_provider=google$/);
    await expect(page.locator(".auth-status[data-state=error]")).toHaveText(copy.en.failed);

    await context.clearCookies();
    await page.goto("/api/auth/oauth/google/callback?code=stolen-code&state=forged");
    await expect(page).toHaveURL(/\/login\?oauth_error=failed&oauth_provider=google$/);
    expect((await context.cookies()).map((entry) => entry.name)).not.toContain("jenan_session");
  });

  test("an unsafe next parameter is dropped before it reaches the provider flow", async ({ context, page }, testInfo) => {
    await setLocale(context, "en", testInfo.project.use.baseURL);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { location } = await start(context, "from=login&next=%2F%2Fevil.example");
    const state = new URL(location).searchParams.get("state")!;
    await page.goto(`/api/auth/oauth/google/callback?error=access_denied&state=${state}`);
    await expect(page).toHaveURL(/\/login\?oauth_error=denied&oauth_provider=google$/);
  });
});
