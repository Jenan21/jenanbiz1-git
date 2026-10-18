"use client";

import { Component, type ReactNode } from "react";
import styles from "./jenan-map.module.css";

export class RendererBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed)
      return (
        <div className={styles.mapMessage} role="alert">
          <h3>تعذر تحميل محرك الخريطة</h3>
          <p>
            يمكنك إدخال الإحداثيات يدوياً أو إغلاق النافذة وإعادة فتحها
            للمحاولة.
          </p>
        </div>
      );
    return this.props.children;
  }
}
