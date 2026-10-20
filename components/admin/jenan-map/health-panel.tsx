"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DeepVerification, HealthReport } from "@/services/jenan-map/health";
import { displayDate, MapEmpty, MapPanel, MapTable } from "./display";
import { formatBytes, mapErrorMessage } from "./snapshot";

const checkLabels = { ok: "سليم", failed: "فشل" } as const;
const overallLabels = { ok: "كل ما قيس اجتاز", attention: "يتطلب انتباهاً", failed: "فشل فحص واحد على الأقل" } as const;
const runtimeLabels = { enabled: "مفعّلة", maintenance: "صيانة", disabled: "معطّلة" } as const;
const unmeasured: Record<string, string> = {
  "browser-rendering": "عرض الخريطة في متصفح فعلي",
  "cdn-and-caching": "CDN والتخزين المؤقت",
  "performance-under-load": "الأداء والتزامن تحت الحمل",
};

const bytesLabel = (value: number) => formatBytes(BigInt(Math.round(value)));
const latency = (value: number | null) => (value === null ? "غير مقاس" : `${value} م.ث`);

/** Anything the server did not describe in full is treated as no report: nothing here is filled in with a default that reads as healthy. */
export function readHealthReport(payload: unknown): HealthReport | null {
  const report = payload as Partial<HealthReport> | null;
  if (!report || typeof report !== "object" || !["ok", "attention", "failed"].includes(String(report.status))) return null;
  if (typeof report.measuredAt !== "string" || !report.database || !report.postgis || !report.storage || !Array.isArray(report.notMeasured)) return null;
  if (report.published && (!Array.isArray(report.published.artifacts) || !Array.isArray(report.published.layers))) return null;
  return report as HealthReport;
}

export function HealthTables({ report }: { report: HealthReport }) {
  const published = report.published;
  return <>
    <MapTable headers={["الفحص", "النتيجة", "القياس"]}>
      <tr><td>قاعدة البيانات</td><td>{checkLabels[report.database.status]}</td><td>زمن استعلام فعلي: {latency(report.database.latencyMs)}</td></tr>
      <tr><td>PostGIS</td><td>{checkLabels[report.postgis.status]}</td><td>الإصدار: <bdi>{report.postgis.version ?? "غير معروف"}</bdi> · {latency(report.postgis.latencyMs)}</td></tr>
      <tr><td>التخزين</td><td>{checkLabels[report.storage.status]}</td><td>{report.storage.driver === "s3" ? "تخزين كائنات متوافق مع S3 (فحص فعلي للحاوية)" : "مجلد ملفات خاص"} · {latency(report.storage.latencyMs)}</td></tr>
      <tr><td>مؤشر الإنتاج</td><td>{!report.runtime ? "غير معروف" : report.runtime.publishedReleaseId ? (published?.consistent ? "متسق" : "غير متسق") : "لا يوجد إصدار منشور"}</td>
        <td>{report.runtime ? <>الخريطة {runtimeLabels[report.runtime.status]} · مراجعة الحالة {report.runtime.revision}{published ? <> · الإصدار <bdi>{published.version}</bdi> ({published.status})</> : null}</> : "تعذرت قراءة حالة التشغيل"}</td></tr>
    </MapTable>
    {published ? <>
      <h3>ملفات الإصدار المنشور (فحص وجود وحجم، دون قراءة المحتوى)</h3>
      <MapTable headers={["النوع", "الملف", "الحجم المسجل", "في التخزين"]}>
        {published.artifacts.map((file) => <tr key={`${file.kind}-${file.filename}`}>
          <td><bdi>{file.kind}</bdi></td><td><bdi>{file.filename}</bdi></td><td>{bytesLabel(file.byteSize)}</td>
          <td>{!file.present ? "مفقود" : file.sizeMatches ? "موجود بالحجم المسجل" : "الحجم مختلف"}</td>
        </tr>)}
      </MapTable>
      <h3>عناصر كل طبقة في قاعدة البيانات</h3>
      {published.layers.length
        ? <MapTable headers={["الطبقة", "عدد العناصر"]}>{published.layers.map((layer) => <tr key={layer.layerId}><td><bdi>{layer.layerId}</bdi></td><td>{layer.features.toLocaleString("en-US")}</td></tr>)}</MapTable>
        : <MapEmpty>لا توجد عناصر في هذا الإصدار.</MapEmpty>}
      <dl>
        <dt>الحدود السعودية المعتمدة</dt><dd>{published.boundary ? <><bdi>{published.boundary.authority}</bdi> — {published.boundary.source}</> : "لا يوجد سجل حدود"}</dd>
        <dt>آخر فحص عميق</dt><dd>{published.verification
          ? `${published.verification.result === "verified" ? "اجتاز" : `فشل (${published.verification.code ?? "غير محدد"})`} — ${displayDate(published.verification.at)} — ${Math.round(published.verification.durationMs / 1000)} ثانية — ${bytesLabel(published.verification.bytes)}`
          : "لم يُجرَ فحص عميق لهذا الإصدار"}</dd>
      </dl>
    </> : null}
  </>;
}

export function MapHealthPanel({ disabled = false }: { disabled?: boolean }) {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState("");
  const [deep, setDeep] = useState<DeepVerification | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/jenan-map/health", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => null);
      const next = response.ok ? readHealthReport(payload) : null;
      if (!next) throw new Error(mapErrorMessage(payload?.error, response.status));
      setReport(next);
      setMessage("");
    } catch (error) {
      setReport(null);
      setMessage(error instanceof Error ? error.message : mapErrorMessage());
    } finally { setLoading(false); }
  }
  const loadOnMount = useEffectEvent(() => { void load(); });
  useEffect(() => {
    const timer = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function verify() {
    setVerifying(true);
    setMessage("");
    setDeep(null);
    try {
      const response = await fetch("/api/admin/jenan-map/health", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify-published" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.error) throw new Error(mapErrorMessage(payload?.error, response.status));
      setDeep(payload as DeepVerification);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : mapErrorMessage());
    } finally { setVerifying(false); }
  }

  const busy = loading || verifying;
  return <MapPanel title="حالة التشغيل — قياس فعلي">
    <p>تُقاس هذه القيم من الخادم عند كل تحديث: زمن قاعدة البيانات، PostGIS، التخزين، وجود ملفات الإصدار المنشور وأحجامها، وعدد عناصر كل طبقة. أما ما لا يستطيع الخادم قياسه فيُعرض غير مقاس ولا يُعد سليماً.</p>
    <div className="jenan-map-admin__actions">
      <Button type="button" variant="secondary" disabled={disabled || busy} onClick={() => void load()}>{loading ? "جارٍ القياس…" : "إعادة القياس"}</Button>
      <Button type="button" disabled={disabled || busy || !report?.published} onClick={() => void verify()}>{verifying ? "جارٍ قراءة الملفات والتحقق منها…" : "فحص عميق لملفات الإصدار المنشور"}</Button>
    </div>
    <p>الفحص العميق يقرأ كل ملف من التخزين ويحسب بصمته ويتحقق من حاوية PMTiles والنمط والخطوط والمراجع وأدلة التغطية، ويُسجَّل في سجل التدقيق. يستغرق بقدر حجم الملفات، وقد يطول لدقائق.</p>
    {message ? <p role="alert">{message}</p> : null}
    {deep ? <p role="status">{deep.status === "verified"
      ? `اجتاز الفحص العميق للإصدار ${deep.version}: ${bytesLabel(deep.bytes)} في ${Math.round(deep.durationMs / 1000)} ثانية.`
      : `فشل الفحص العميق للإصدار ${deep.version}: ${deep.code ?? "غير محدد"}. لا تعتمد هذا الإصدار قبل المعالجة.`}</p> : null}
    {report ? <>
      <p role="status" data-health-status={report.status}><strong>{overallLabels[report.status]}</strong> — قيس {displayDate(report.measuredAt)}</p>
      <HealthTables report={report} />
      <h3>غير مقاس من الخادم</h3>
      <ul>{report.notMeasured.map((item) => <li key={item}>{unmeasured[item] ?? item}: غير مقاس هنا؛ يُثبت بحزمة قبول المتصفح (docs/jenan-map.md) وباختبارات الإنتاج، ولا تدّعي هذه الصفحة سلامته.</li>)}</ul>
    </> : <MapEmpty>{loading ? "جارٍ القياس…" : "تعذر القياس؛ حالة التشغيل غير معروفة."}</MapEmpty>}
  </MapPanel>;
}
