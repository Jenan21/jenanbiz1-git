"use client";

import { lazy, Suspense } from "react";
import { RendererBoundary } from "./renderer-boundary";
import type { RendererProps } from "./types";
import styles from "./jenan-map.module.css";

const Renderer = lazy(() => import("./map-renderer"));

export function RendererShell(props: RendererProps) {
  return (
    <RendererBoundary>
      <Suspense
        fallback={
          <div className={styles.mapMessage} role="status">
            جارٍ تحميل محرك الخريطة…
          </div>
        }
      >
        <Renderer {...props} />
      </Suspense>
    </RendererBoundary>
  );
}
