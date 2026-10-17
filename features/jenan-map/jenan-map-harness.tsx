"use client";

import { useState } from "react";
import Link from "next/link";
import { JenanMapModal } from "./jenan-map-modal";
import type { JenanLocation } from "./types";
import styles from "./jenan-map.module.css";

export function JenanMapHarness() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<JenanLocation | null>(null);
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
                <time dateTime={location.selectedAt}>
                  {new Date(location.selectedAt).toLocaleString("ar-SA")}
                </time>
              </p>
            </>
          ) : (
            <p>لم يتم تأكيد موقع بعد. افتح الخريطة للبحث أو الاختيار يدوياً.</p>
          )}
          <button className={styles.primary} onClick={() => setOpen(true)}>
            {location ? "تعديل الموقع" : "اختيار موقع على الخريطة"}
          </button>
          <p className={styles.note}>
            يُحفظ الاختيار مؤقتاً في هذه الصفحة فقط، وليس في سجل مشروع أو قاعدة
            البيانات. يزول عند إعادة تحميل الصفحة.
          </p>
        </section>
        <Link className={styles.backLink} href="/dashboard">
          العودة إلى لوحة التحكم ←
        </Link>
      </div>
      {open && (
        <JenanMapModal
          value={location}
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
