import type { MapRelease } from "./types";
import { MAP_STOPPED_MESSAGE } from "@/services/jenan-map/contracts";

/**
 * The first request for a map after the server started, or after a release was imported, makes the server check every file of the release,
 * which for a country-sized archive is a read of about a gigabyte: slow once, instant afterwards. The manifest therefore gets far longer than
 * the interactive requests, and after `SLOW_MANIFEST_NOTICE_MS` the dialog says why it is waiting instead of looking stuck.
 */
export const MANIFEST_TIMEOUT_MS = 120_000;
export const SLOW_MANIFEST_NOTICE_MS = 6_000;

export async function mapRequest<T>(
  url: string,
  init: RequestInit = {},
  timeout = 10_000,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...init.headers,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const messages: Record<string, string> = {
        OUTSIDE_SAUDI_ARABIA:
          "النقطة خارج الحدود المعتمدة للمملكة العربية السعودية. اختر موقعاً آخر.",
        AUTHORITATIVE_BOUNDARY_UNAVAILABLE:
          "الحدود السعودية المعتمدة غير متاحة. لا يمكن تأكيد الموقع حالياً.",
        NO_PUBLISHED_RELEASE: "لا يوجد إصدار خريطة منشور متاح حالياً.",
        MAP_MAINTENANCE: MAP_STOPPED_MESSAGE,
        MAP_DISABLED: MAP_STOPPED_MESSAGE,
        RELEASE_NOT_PUBLISHED:
          "تغير الإصدار المنشور. أعد فتح الخريطة قبل حفظ الموقع.",
        STALE_REVISION: "تغيرت إعدادات الخريطة في نافذة أخرى. أعد فتح الخريطة لاستعادتها.",
        LAYER_DATA_UNAVAILABLE: "تغيرت الطبقات المتاحة. أعد فتح الخريطة قبل حفظ الإعدادات.",
      };
      throw new Error(
        messages[body?.error] ??
          (response.status === 401
            ? "انتهت الجلسة. سجل الدخول مجدداً."
            : response.status === 403
              ? "لا تملك صلاحية الوصول إلى هذا الإصدار."
              : response.status === 429
                ? "طلبات كثيرة. انتظر قليلاً ثم حاول مجدداً."
                : "تعذر الوصول إلى خدمة الخريطة. حاول مجدداً."),
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new Error("انتهت مهلة الاتصال. تحقق من الشبكة وحاول مجدداً.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}

export function controlledMapUrl(
  value: string,
  origin: string,
  adminPreview = false,
): string {
  const protocol = value.startsWith("pmtiles://") ? "pmtiles://" : "";
  const url = new URL(protocol ? value.slice(protocol.length) : value, origin);
  if (
    url.origin !== origin ||
    !(
      url.pathname.startsWith("/api/jenan-map/") ||
      (adminPreview && url.pathname.startsWith("/api/admin/jenan-map/"))
    ) ||
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    throw new Error("مصدر خريطة غير معتمد");
  }

  return protocol + url.href.replaceAll("%7B", "{").replaceAll("%7D", "}");
}

export function mapManifestUrl(preview: string | null) {
  return preview
    ? `/api/admin/jenan-map/preview?releaseId=${encodeURIComponent(preview)}`
    : "/api/jenan-map";
}

export function mapSearchUrl(preview: string | null, releaseId: string, query: string, layerIds: string[]) {
  const params = new URLSearchParams({ q: query.trim(), releaseId, layerIds: layerIds.join(",") });
  return `/api/${preview ? "admin/" : ""}jenan-map/search?${params}`;
}

export function controlledReleaseMapUrl(
  value: string,
  origin: string,
  release: Pick<MapRelease, "id" | "artifacts">,
  adminPreview = false,
) {
  const controlled = controlledMapUrl(value, origin, adminPreview);
  const protocol = controlled.startsWith("pmtiles://") ? "pmtiles://" : "";
  const url = new URL(controlled.replace(/^pmtiles:\/\//, ""));
  const path = url.pathname.replaceAll("%7B", "{").replaceAll("%7D", "}");
  const publicPrefix = `/api/jenan-map/releases/${encodeURIComponent(release.id)}/`;
  const releasePrefix = `/api/${adminPreview ? "admin/" : ""}jenan-map/releases/${encodeURIComponent(release.id)}/`;
  if (path.startsWith(publicPrefix)) {
    url.pathname = releasePrefix + path.slice(publicPrefix.length);
    return protocol + url.href.replaceAll("%7B", "{").replaceAll("%7D", "}");
  }
  const artifact = release.artifacts?.find((artifact) => {
    const allowed = new URL(
      controlledMapUrl(artifact.url, origin, adminPreview),
    ).pathname;
    const canonical = `/api/jenan-map/artifacts/${encodeURIComponent(artifact.id)}`;
    const suffix = path.startsWith(`${canonical}/`) ? path.slice(canonical.length)
      : path.startsWith(`${allowed}/`) ? path.slice(allowed.length) : "";
    return path === allowed || path === canonical ||
      (protocol && artifact.kind === "pmtiles" && /^\/(?:\d+|\{z\})\/(?:\d+|\{x\})\/(?:\d+|\{y\})$/.test(suffix));
  });
  if (!path.startsWith(releasePrefix) && !artifact) {
    throw new Error("مصدر الخريطة غير مرتبط بالإصدار المحدد.");
  }
  if (artifact) {
    const canonical = `/api/jenan-map/artifacts/${encodeURIComponent(artifact.id)}`;
    const allowed = new URL(artifact.url, origin).pathname;
    const base = path === canonical || path.startsWith(`${canonical}/`) ? canonical : allowed;
    url.pathname = allowed + path.slice(base.length);
    return protocol + url.href.replaceAll("%7B", "{").replaceAll("%7D", "}");
  }
  return controlled;
}

export function assertPinnedRelease(
  manifest: { release: { id: string } | null },
  preview: string | null,
) {
  if (preview && manifest.release?.id !== preview) {
    throw new Error(
      "المعاينة المطلوبة غير متاحة أو غير مصرح بها. لم يتم تحميل إصدار بديل.",
    );
  }
}
