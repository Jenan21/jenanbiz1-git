"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { assertPinnedRelease, mapManifestUrl, mapRequest } from "./api";
import { focusLoopTarget } from "./accessibility";
import { saveOwnedMapLocation } from "./location-api";
import { coordinateDraft, isCoordinate, MAP_RADII } from "./geometry";
import { RendererBoundary } from "./renderer-boundary";
import type {
  JenanLocation,
  LocationSource,
  MapManifest,
  SearchResult,
} from "./types";
import styles from "./jenan-map.module.css";

const Renderer = lazy(() => import("./map-renderer"));
const statusLabels = {
  maintenance: "الخريطة تحت الصيانة حالياً. لم يتم تغيير موقعك المحفوظ.",
  disabled: "خدمة الخريطة معطلة حالياً.",
  unavailable: "لا يوجد إصدار خريطة منشور متاح حالياً.",
  enabled: "لا يوجد إصدار خريطة منشور متاح حالياً.",
};

export function JenanMapModal({
  value,
  onCancel,
  onConfirm,
  returnFocusRef,
}: {
  value: JenanLocation | null;
  onCancel: () => void;
  onConfirm: (location: JenanLocation) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const [manifest, setManifest] = useState<MapManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [rendererError, setRendererError] = useState("");
  const [draft, setDraft] = useState(value);
  const [coordinates, setCoordinates] = useState({
    latitude: value?.latitude.toString() ?? "",
    longitude: value?.longitude.toString() ?? "",
  });
  const [radius, setRadius] = useState<number>(1000);
  const [visibleLayers, setVisibleLayers] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [searchError, setSearchError] = useState("");
  const [validating, setValidating] = useState(false);
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const selectionVersion = useRef(0);
  const geolocationVersion = useRef(0);
  const searchVersion = useRef(0);
  const validationController = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const preview =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("preview")
      : null;

  useEffect(() => {
    const focused =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const previousOverflow = document.body.style.overflow;
    const geoGeneration = geolocationVersion;
    const selectionGeneration = selectionVersion;
    document.body.style.overflow = "hidden";
    const element = dialog.current;
    element?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!saving.current) onCancel();
      }
      if (event.key !== "Tab" || !element) return;
      const focusable = Array.from(
        element.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      ).filter((item) => item.getClientRects().length > 0);
      const target = focusLoopTarget<Element>(
        document.activeElement,
        focusable,
        event.shiftKey,
        element,
      );
      if (target instanceof HTMLElement) {
        event.preventDefault();
        target.focus();
      }
    };
    const focusin = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        element &&
        !element.contains(event.target)
      )
        element.focus();
    };
    document.addEventListener("keydown", keydown);
    document.addEventListener("focusin", focusin);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("focusin", focusin);
      geoGeneration.current++;
      selectionGeneration.current++;
      validationController.current?.abort();
      focused?.focus();
    };
  }, [onCancel, returnFocusRef]);

  useEffect(() => {
    const controller = new AbortController();
    mapRequest<MapManifest>(mapManifestUrl(preview), {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        assertPinnedRelease(data, preview);
        setManifest(data);
        setVisibleLayers(
          data.release?.layers
            .filter((layer) => layer.available && layer.styleLayerIds?.length)
            .map((layer) => layer.id) ?? [],
        );
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setManifestLoading(false);
      });
    return () => controller.abort();
  }, [attempt, preview]);

  useEffect(() => {
    const version = ++searchVersion.current;
    const controller = new AbortController();
    if (
      query.trim().length < 2 ||
      !manifest?.release ||
      manifest.status !== "enabled" ||
      Boolean(preview)
    ) {
      return () => controller.abort();
    }
    const timer = setTimeout(() => {
      mapRequest<{ results: SearchResult[] }>(
        `/api/jenan-map/search?q=${encodeURIComponent(query.trim())}&releaseId=${encodeURIComponent(manifest.release!.id)}`,
        { signal: controller.signal },
      )
        .then((data) => {
          if (version !== searchVersion.current || controller.signal.aborted)
            return;
          setResults(data.results);
          setSearchState("done");
        })
        .catch((reason: Error) => {
          if (version !== searchVersion.current || controller.signal.aborted)
            return;
          setSearchError(reason.message);
          setSearchState("error");
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, manifest, preview]);

  const select = useCallback(
    (latitude: number, longitude: number, source: LocationSource = "map") => {
      if (saving.current || !isCoordinate(latitude, longitude)) return;
      selectionVersion.current++;
      validationController.current?.abort();
      geolocationVersion.current++;
      setLocating(false);
      setValidating(false);
      setDraft(coordinateDraft(latitude, longitude, source));
      setCoordinates({
        latitude: latitude.toString(),
        longitude: longitude.toString(),
      });
      setAccuracy(null);
      setError("");
    },
    [],
  );

  function geolocate() {
    if (saving.current) return;
    if (!navigator.geolocation) {
      setError("تحديد الموقع غير مدعوم في هذا المتصفح.");
      return;
    }
    const version = ++geolocationVersion.current;
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (version !== geolocationVersion.current) return;
        select(
          position.coords.latitude,
          position.coords.longitude,
          "geolocation",
        );
        setAccuracy(position.coords.accuracy);
      },
      (reason) => {
        if (version !== geolocationVersion.current) return;
        setLocating(false);
        setError(
          reason.code === 1
            ? "لم تسمح بالوصول إلى موقعك. يمكنك الاختيار يدوياً."
            : reason.code === 3
              ? "انتهت مهلة تحديد الموقع. يمكنك الاختيار يدوياً."
              : "تعذر تحديد موقعك الحالي.",
        );
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  }

  function editCoordinate(key: "latitude" | "longitude", text: string) {
    if (saving.current) return;
    setCoordinates((current) => ({ ...current, [key]: text }));
    setDraft(null);
    selectionVersion.current++;
    geolocationVersion.current++;
    validationController.current?.abort();
    setValidating(false);
    setLocating(false);
    setAccuracy(null);
    setError("");
  }

  async function confirm() {
    if (!draft || validating || preview || !manifest?.release) return;
    if (!draft.source) {
      setError("أعد اختيار النقطة لتحديد مصدر الموقع قبل الحفظ.");
      return;
    }
    const version = selectionVersion.current;
    const controller = new AbortController();
    validationController.current?.abort();
    validationController.current = controller;
    saving.current = true;
    geolocationVersion.current++;
    setLocating(false);
    setValidating(true);
    setError("");
    try {
      const result = await saveOwnedMapLocation(
        {
          latitude: draft.latitude,
          longitude: draft.longitude,
          source: draft.source,
          releaseId: manifest.release.id,
        },
        controller.signal,
      );
      if (version !== selectionVersion.current || controller.signal.aborted)
        return;
      onConfirm(result);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "تعذر تأكيد حفظ الموقع. أعد فتح الخريطة للتحقق.",
        );
    } finally {
      saving.current = false;
      if (!controller.signal.aborted) setValidating(false);
    }
  }

  const enabled =
    !manifestLoading &&
    manifest?.status === "enabled" &&
    Boolean(manifest.release);
  const canRender = enabled && Boolean(manifest?.release?.styleUrl);
  return createPortal(
    <div className={styles.overlay} dir="rtl" lang="ar">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        ref={dialog}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>JENAN PRO MAP</p>
            <h2 id={titleId}>حدد موقعك بدقة</h2>
            <p id={descriptionId}>
              ابحث أو اضغط على الخريطة، ثم أكد موقعك بعد التحقق من الحدود
              السعودية.
            </p>
          </div>
          <button
            className={styles.close}
            aria-label="إغلاق الخريطة دون حفظ"
            disabled={validating}
            onClick={onCancel}
          >
            ×
          </button>
        </header>
        {preview && (
          <p className={styles.preview}>
            معاينة إصدار إداري — لا تغير الإصدار المنشور أو بيانات المشاريع.
          </p>
        )}
        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <label htmlFor={`${titleId}-search`}>البحث عن موقع</label>
            <input
              id={`${titleId}-search`}
              value={query}
              maxLength={120}
              disabled={!enabled || Boolean(preview) || validating}
              title={preview ? "البحث متاح للإصدار المنشور فقط" : undefined}
              onChange={(event) => {
                searchVersion.current++;
                setQuery(event.target.value);
                setResults([]);
                setSearchError("");
                setSearchState(
                  event.target.value.trim().length >= 2 ? "loading" : "idle",
                );
              }}
              placeholder="مدينة، حي أو عنوان"
              autoComplete="off"
            />
            <div className={styles.searchStatus} role="status">
              {searchState === "loading" && "جارٍ البحث…"}
              {searchState === "done" &&
                results.length === 0 &&
                "لا توجد نتائج في فهرس الإصدار المتاح."}
              {searchState === "error" && searchError}
            </div>
            {results.length > 0 && (
              <ul className={styles.results} aria-label="نتائج البحث">
                {results.map((result) => (
                  <li key={result.id}>
                    <button
                      onClick={() => {
                        select(result.latitude, result.longitude, "search");
                        searchVersion.current++;
                        setQuery("");
                        setResults([]);
                        setSearchState("idle");
                      }}
                    >
                      {result.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              className={styles.secondary}
              disabled={!enabled || locating || validating}
              onClick={geolocate}
            >
              {locating ? "جارٍ تحديد الموقع…" : "◎ استخدام موقعي الحالي"}
            </button>
            {accuracy !== null && (
              <p className={styles.note}>
                دقة الجهاز التقريبية: ±{Math.round(accuracy)} متر. ليست دقة حدود
                الأرض.
              </p>
            )}
            <fieldset
              disabled={!enabled || validating}
              className={styles.coordinates}
            >
              <legend>الإحداثيات — اختيار بديل بلوحة المفاتيح</legend>
              <label>
                خط العرض
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  dir="ltr"
                  value={coordinates.latitude}
                  onChange={(event) =>
                    editCoordinate("latitude", event.target.value)
                  }
                />
              </label>
              <label>
                خط الطول
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  dir="ltr"
                  value={coordinates.longitude}
                  onChange={(event) =>
                    editCoordinate("longitude", event.target.value)
                  }
                />
              </label>
              <button
                className={styles.secondary}
                onClick={() => {
                  if (
                    !coordinates.latitude.trim() ||
                    !coordinates.longitude.trim() ||
                    !isCoordinate(
                      Number(coordinates.latitude),
                      Number(coordinates.longitude),
                    )
                  ) {
                    setError("أدخل إحداثيات صحيحة.");
                    return;
                  }
                  select(
                    Number(coordinates.latitude),
                    Number(coordinates.longitude),
                    "coordinates",
                  );
                }}
              >
                عرض النقطة
              </button>
            </fieldset>
            <fieldset disabled={!enabled} className={styles.radius}>
              <legend>نطاق المسافة</legend>
              {MAP_RADII.map((meters) => (
                <label key={meters}>
                  <input
                    type="radio"
                    name={`${titleId}-radius`}
                    checked={radius === meters}
                    onChange={() => setRadius(meters)}
                  />
                  {meters === 500 ? "٥٠٠ م" : `${meters / 1000} كم`}
                </label>
              ))}
            </fieldset>
            <p className={styles.note}>
              دائرة مسافة جغرافية فقط؛ ليست تحليلاً للسوق أو زمن وصول.
            </p>
            <fieldset className={styles.layers} disabled={!enabled}>
              <legend>طبقات الخريطة</legend>
              {manifest?.release?.layers.map((layer) => (
                <label key={layer.id} title={layer.reason}>
                  <input
                    type="checkbox"
                    disabled={!layer.available || !layer.styleLayerIds?.length}
                    checked={
                      layer.available &&
                      Boolean(layer.styleLayerIds?.length) &&
                      visibleLayers.includes(layer.id)
                    }
                    onChange={(event) =>
                      setVisibleLayers((current) =>
                        event.target.checked
                          ? [...current, layer.id]
                          : current.filter((id) => id !== layer.id),
                      )
                    }
                  />
                  {layer.label || "طبقة مكانية غير مدعومة في العارض"}
                  {(!layer.available || !layer.styleLayerIds?.length) && (
                    <small>{layer.reason || "غير متاحة"}</small>
                  )}
                </label>
              ))}
              <label>
                <input type="checkbox" disabled />
                تحليلات السوق <small>لا توجد بيانات معتمدة متاحة</small>
              </label>
            </fieldset>
            {manifest?.release && (
              <div className={styles.note}>
                <p>المصدر: {manifest.release.source || "غير متاح"}</p>
                <p>
                  تاريخ المصدر:{" "}
                  {manifest.release.sourceDate
                    ? new Date(manifest.release.sourceDate).toLocaleDateString(
                        "ar-SA",
                      )
                    : "غير متاح"}
                </p>
                <p>الترخيص: {manifest.release.license || "غير متاح"}</p>
                <p>لا تمثل الخريطة مسحاً عقارياً أو توصية استثمارية.</p>
              </div>
            )}
          </aside>
          <section className={styles.mapPanel} aria-label="خريطة اختيار الموقع">
            {canRender && !rendererError && (
              <RendererBoundary>
                <Suspense
                  fallback={
                    <div className={styles.mapMessage} role="status">
                      جارٍ تحميل محرك الخريطة…
                    </div>
                  }
                >
                  <Renderer
                    adminPreview={Boolean(preview)}
                    release={manifest!.release!}
                    location={draft}
                    radius={radius}
                    visibleLayers={visibleLayers}
                    onSelect={select}
                    onError={setRendererError}
                  />
                </Suspense>
              </RendererBoundary>
            )}
            {(!canRender || rendererError) && (
              <div className={styles.mapMessage} role="status">
                <span className={styles.mapSymbol} aria-hidden="true">
                  ⌖
                </span>
                <h3>
                  {manifestLoading
                    ? "جارٍ الاتصال بخريطة جنان برو…"
                    : rendererError ||
                      error ||
                      (enabled && !canRender
                        ? "لا يتضمن الإصدار نمط خريطة معتمداً. يمكنك إدخال الإحداثيات يدوياً."
                        : "") ||
                      statusLabels[manifest?.status ?? "unavailable"]}
                </h3>
                {!manifestLoading && (
                  <button
                    className={styles.secondary}
                    onClick={() => {
                      setManifest(null);
                      setManifestLoading(true);
                      setError("");
                      setRendererError("");
                      setResults([]);
                      setSearchState("idle");
                      setAttempt((current) => current + 1);
                    }}
                  >
                    إعادة المحاولة
                  </button>
                )}
                <p>لا نستخدم خرائط عامة بديلة أو بيانات تجريبية.</p>
              </div>
            )}
            {draft && (
              <div className={styles.draftBadge}>
                <strong>نقطة مسودة</strong>
                <span dir="ltr">
                  {draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}
                </span>
                <small>
                  {draft.formattedAddress ||
                    "العنوان التفصيلي غير متاح حتى التحقق"}
                </small>
              </div>
            )}
          </section>
        </div>
        <footer className={styles.footer}>
          <div>
            <p className={styles.note}>
              الإصدار: {manifest?.release?.version ?? "غير متاح"} · الحفظ في
              حسابك فقط؛ المشاريع الحالية لا تتغير
            </p>
            <p role="alert" className={styles.error}>
              {error}
            </p>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              disabled={validating}
              onClick={onCancel}
            >
              إلغاء
            </button>
            <button
              className={styles.primary}
              disabled={!enabled || !draft || validating || Boolean(preview)}
              onClick={confirm}
            >
              {preview
                ? "معاينة للقراءة فقط"
                : validating
                  ? "جارٍ التحقق وحفظ الموقع…"
                  : "تأكيد الموقع"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
