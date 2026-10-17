import type { MapRelease } from "./types";

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
        MAP_MAINTENANCE: "الخريطة تحت الصيانة حالياً.",
        MAP_DISABLED: "خدمة الخريطة معطلة حالياً.",
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

export function controlledReleaseMapUrl(
  value: string,
  origin: string,
  release: Pick<MapRelease, "id" | "artifacts">,
  adminPreview = false,
) {
  const controlled = controlledMapUrl(value, origin, adminPreview);
  const path = new URL(controlled.replace(/^pmtiles:\/\//, "")).pathname;
  const releasePrefix = `/api/${adminPreview ? "admin/" : ""}jenan-map/releases/${encodeURIComponent(release.id)}/`;
  const artifactMatches = release.artifacts?.some((artifact) => {
    const allowed = new URL(
      controlledMapUrl(artifact.url, origin, adminPreview),
    ).pathname;
    return path === allowed || path.startsWith(`${allowed}/`);
  });
  if (!path.startsWith(releasePrefix) && !artifactMatches) {
    throw new Error("مصدر الخريطة غير مرتبط بالإصدار المحدد.");
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
