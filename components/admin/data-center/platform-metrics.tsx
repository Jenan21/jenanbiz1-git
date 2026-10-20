import { Card } from "@/components/ui/card";
import { displayDataCenterValue } from "@/lib/admin/data-center-routes";
import { parsePlatformMetrics, PLATFORM_METRIC_KEYS, PLATFORM_METRIC_LABELS, type PlatformMetricsState } from "@/lib/admin/data-center-platform-metric-keys";
import { DATA_CENTER_API, dataCenterRequest } from "./api";
import styles from "./data-center.module.css";

export async function loadPlatformMetrics(signal: AbortSignal): Promise<PlatformMetricsState> {
  try {
    return parsePlatformMetrics((await dataCenterRequest(`${DATA_CENTER_API}?area=platform`, { signal })).platform);
  } catch {
    return { status: "unavailable" };
  }
}

export function PlatformMetrics({ state }: { state: PlatformMetricsState }) {
  return (
    <Card className={styles.panel}>
      <h2>Platform Metrics · مقاييس المنصة</h2>
      <p className={styles.muted}>أعداد سجلات فعلية من قاعدة البيانات لحظة القياس. ليست مؤشرات صحة أو أداء: قياس الصحة يتطلب مصدر مراقبة معتمداً، ولا يُعرض أي رقم بديل عنه.</p>
      <section className={styles.stats} aria-label="مقاييس المنصة" data-platform-metrics={state.status}>
        {PLATFORM_METRIC_KEYS.map((key) => (
          <div key={key} className={styles.stat}>
            <span>{PLATFORM_METRIC_LABELS[key]}</span>
            <strong>{state.status === "loading" ? "…" : displayDataCenterValue(state.status === "ready" ? state.counts[key] : null)}</strong>
          </div>
        ))}
      </section>
      {state.status === "ready" ? <p className={styles.muted}>وقت القياس: <time dateTime={state.measuredAt}>{new Date(state.measuredAt).toLocaleString("ar-SA")}</time></p> : null}
      {state.status === "unavailable" ? <p role="status" className={styles.empty}>تعذر قياس مقاييس المنصة الآن. لم تُعرض أرقام بديلة.</p> : null}
    </Card>
  );
}
