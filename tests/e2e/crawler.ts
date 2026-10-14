import { expect, type Page } from "@playwright/test";

export const origin = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;

// Ids and long numbers in a path stand for "one record of this kind"; one visit per shape is enough.
const RECORD_SEGMENT = /^(?:c[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f-]{27}|\d{4,})$/i;
const shapeOf = (pathname: string) => pathname.split("/").map((part) => (RECORD_SEGMENT.test(part) ? ":id" : part)).join("/");
const isPage = (pathname: string) =>
  !/^\/(api|_next)\//.test(pathname) &&
  !/\.(pdf|csv|xlsx|docx|pptx|zip|png|jpe?g|webp|svg|ico|txt|json)$/i.test(pathname) &&
  !/\/(logout|print)(\/|$)/.test(pathname);

export interface Finding {
  url: string;
  status: number | string;
  from: string;
}

export interface CrawlOptions {
  /** Runs after a page loaded successfully, e.g. to collect something from it. */
  onVisited?: (page: Page, path: string) => Promise<void>;
}

/** Visits every internal page reachable from the seeds (one visit per URL shape) and reports what is broken. */
export async function crawl(page: Page, seeds: string[], limit: number, expectSession: boolean, options: CrawlOptions = {}) {
  const queue = seeds.map((path) => ({ path, from: "(start)" }));
  const shapes = new Set<string>();
  const visited: string[] = [];
  const findings: Finding[] = [];

  while (queue.length && visited.length < limit) {
    const { path, from } = queue.shift()!;
    const shape = shapeOf(path.split("?")[0]);
    if (shapes.has(shape)) continue;
    shapes.add(shape);

    const errors: string[] = [];
    const onError = (error: Error) => errors.push(error.message.slice(0, 160));
    page.on("pageerror", onError);
    let status: number | string = "no response";
    try {
      const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
      status = response?.status() ?? "no response";
      if (typeof status === "number" && status < 400) {
        const finalUrl = new URL(page.url());
        const authPath = /^\/(auth|login|register)(\/|$)/;
        if (expectSession && authPath.test(finalUrl.pathname) && !authPath.test(path.split("?")[0])) {
          findings.push({ url: path, status: "redirected to sign-in", from });
        }
        const body = (await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "")).slice(0, 4000);
        if (/Application error|This page couldn.t load|Something went wrong/i.test(body)) findings.push({ url: path, status: "error page rendered", from });
        visited.push(path);
        await options.onVisited?.(page, path);
        const hrefs = await page.$$eval("a[href]", (anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""));
        for (const href of hrefs) {
          if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
          let url: URL;
          try {
            url = new URL(href, origin);
          } catch {
            continue;
          }
          if (url.origin !== origin || !isPage(url.pathname)) continue;
          queue.push({ path: `${url.pathname}${url.search}`, from: path });
        }
      } else {
        findings.push({ url: path, status, from });
      }
    } catch (error) {
      findings.push({ url: path, status: `navigation failed: ${(error as Error).message.split("\n")[0].slice(0, 120)}`, from });
    } finally {
      page.off("pageerror", onError);
    }
    if (errors.length) findings.push({ url: path, status: `script error: ${errors[0]}`, from });
  }
  return { visited, findings };
}

export function expectNoFindings(findings: Finding[]) {
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
}
