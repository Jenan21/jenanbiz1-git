"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { loadOwnedMapLocation } from "./location-api";
import type { JenanLocation } from "./types";
import styles from "./jenan-map.module.css";

const JenanMapModal = dynamic(
  () => import("./jenan-map-modal").then((module) => module.JenanMapModal),
  { ssr: false, loading: () => null },
);

export function JenanMapHarness() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<JenanLocation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const loading = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => () => loading.current?.abort(), []);

  async function openMap() {
    if (new URLSearchParams(window.location.search).get("preview")) {
      setOpen(true);
      return;
    }
    loading.current?.abort();
    const controller = new AbortController();
    loading.current = controller;
    setOpening(true);
    setError("");
    try {
      const result = await loadOwnedMapLocation(controller.signal);
      if (controller.signal.aborted) return;
      setLocation(result);
      setLoaded(true);
      setOpen(true);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(
          reason instanceof Error
            ? reason.message
            : "تعذر استعادة الموقع المحفوظ. حاول مجدداً.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setOpening(false);
    }
  }
  return (
    <main className={styles.harness} dir="rtl" lang="ar">
      <div className={styles.harnessInner}>
        <p className={styles.eyebrow}>JENAN PRO · GEO WORKSPACE</p>
        <h1>الموقع بداية القرار</h1>
        <p className={styles.lead}>
          خريطة جنان برو المستقلة لاختيار موقع داخل المملكة العربية السعودية.
        </p>
        <section
          className={styles.savedCard}
          aria-labelledby="saved-location-heading"
        >
          <span className={styles.tag}>مساحة مستقلة</span>
          <h2 id="saved-location-heading">الموقع المختار</h2>
          {location ? (
            <>
              <p>
                {location.formattedAddress ||
                  "موقع مؤكد داخل المملكة — العنوان التفصيلي غير متاح"}
              </p>
              <p dir="ltr">
                {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </p>
              <p>
                آخر تأكيد:{" "}
                {location.selectedAt ? (
                  <time dateTime={location.selectedAt}>
                    {new Date(location.selectedAt).toLocaleString("ar-SA")}
                  </time>
                ) : (
                  "غير متاح في السجل السابق"
                )}
              </p>
            </>
          ) : (
            <p>
              {loaded
                ? "لا يوجد موقع محفوظ بعد. افتح الخريطة لاختيار موقع."
                : "لم يتم تحميل الموقع المحفوظ بعد. افتح الخريطة لاستعادته أو اختيار موقع جديد."}
            </p>
          )}
          <button
            ref={trigger}
            className={styles.primary}
            disabled={opening}
            onClick={openMap}
          >
            {opening
              ? "جارٍ استعادة الموقع المحفوظ…"
              : location
                ? "تعديل الموقع"
                : "اختيار موقع على الخريطة"}
          </button>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <p className={styles.note}>
            يُحفظ الموقع بعد التأكيد في حسابك بصورة مستقلة. لا تتغير مواقع
            المشاريع الحالية، ولا يُحفظ أي تعديل عند الإلغاء.
          </p>
        </section>
        <Link className={styles.backLink} href="/dashboard">
          العودة إلى لوحة التحكم ←
        </Link>
      </div>
      {open && (
        <JenanMapModal
          value={location}
          returnFocusRef={trigger}
          onCancel={() => setOpen(false)}
          onConfirm={(next) => {
            setLocation(next);
            setOpen(false);
          }}
        />
      )}
    </main>
  );
}
