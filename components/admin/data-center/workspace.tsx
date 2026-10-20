"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { DATA_CENTER_SECTIONS, dataCenterHref, displayDataCenterValue, findDataCenterSection, type DataCenterSection } from "@/lib/admin/data-center-routes";
import { asRecords, DATA_CENTER_API, dataCenterErrorMessage, dataCenterRequest } from "./api";
import { CommandForm, DATA_CENTER_COMMANDS, type CommandDefinition } from "./command-form";
import { RecordDetails, type DataCenterRecord } from "./record-details";
import { PlatformMetrics, loadPlatformMetrics } from "./platform-metrics";
import type { PlatformMetricsState } from "@/lib/admin/data-center-platform-metric-keys";
import styles from "./data-center.module.css";

const areas: Record<DataCenterSection, string> = {
  overview: "overview", data: "items", knowledge: "items", assets: "items", imports: "imports",
  sources: "sources", evidence: "evidence", conflicts: "conflicts", versions: "items",
  "robot-knowledge": "overview", academy: "academy", publishing: "items", usage: "usage", audit: "audit", settings: "overview",
};
const statLabels: Record<string, string> = {
  sources: "مصادر مسجلة", items: "سجلات المحتوى", published: "لها إصدار منشور", reviews: "بانتظار المراجعة",
  conflicts: "تعارضات مفتوحة", imports: "عمليات استيراد", usage: "سجلات استخدام", types: "أنواع مسجلة", academyReleases: "اقتراحات الأكاديمية",
};
const grantStates = { ACTIVE: "سارية", EXPIRED: "منتهية", REVOKED: "مسحوبة" } as const;
function grantState(grant: DataCenterRecord): keyof typeof grantStates {
  if (grant.revokedAt) return "REVOKED";
  return new Date(String(grant.expiresAt)).getTime() <= Date.now() ? "EXPIRED" : "ACTIVE";
}
type FormState = { definition: CommandDefinition; fixed?: DataCenterRecord } | null;
type Snapshot = { rows: DataCenterRecord[]; total: number | null; data: DataCenterRecord };

export function sectionQuery(section: DataCenterSection, page: number, query = "", status = "", layer = "") {
  const params = new URLSearchParams({ area: areas[section], page: String(page), limit: "20" });
  if (query) params.set("query", query);
  if (status) params.set("status", status);
  const sectionLayer = section === "data" ? "DATA" : section === "knowledge" ? "KNOWLEDGE" : layer;
  if (sectionLayer) params.set("layer", sectionLayer);
  if (section === "assets") params.set("categoryKey", "assets");
  return params;
}

function payloadData(payload: DataCenterRecord): DataCenterRecord {
  const value = payload.result ?? payload.item ?? payload.data ?? payload.dataCenter ?? payload;
  return value && typeof value === "object" && !Array.isArray(value) ? value as DataCenterRecord : {};
}

export function DataCenterWorkspace({ section }: { section: DataCenterSection }) {
  const definition = findDataCenterSection(section)!;
  const [snapshot, setSnapshot] = useState<Snapshot>({ rows: [], total: null, data: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ query: "", status: "", layer: "" });
  const [form, setForm] = useState<FormState>(null);
  const [selected, setSelected] = useState<DataCenterRecord | null>(null);
  const [sources, setSources] = useState<DataCenterRecord[]>([]);
  const [types, setTypes] = useState<DataCenterRecord[]>([]);
  const [capabilities, setCapabilities] = useState<DataCenterRecord | null>(null);
  const [context, setContext] = useState<DataCenterRecord | null>(null);
  const [retrievalParams, setRetrievalParams] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [platform, setPlatform] = useState<PlatformMetricsState>({ status: "loading" });
  const [grants, setGrants] = useState<DataCenterRecord[]>([]);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    setSnapshot({ rows: [], total: null, data: {} });
    const metrics = section === "overview" ? loadPlatformMetrics(signal) : null;
    if (metrics) setPlatform({ status: "loading" });
    try {
      const payload = await dataCenterRequest(`${DATA_CENTER_API}?${sectionQuery(section, page, filters.query, filters.status, filters.layer)}`, { signal });
      const data = payloadData(payload);
      if (!signal.aborted) {
        if (section === "settings") {
          const registries = await Promise.all(["types", "categories", "departments"].map((area) => dataCenterRequest(`${DATA_CENTER_API}?area=${area}&limit=100`, { signal })));
          if (!signal.aborted) setSnapshot({ rows: [], total: null, data: {
            capabilities: payload.capabilities ?? null, backup: data.backup ?? null,
            classificationRegistry: Object.fromEntries(registries.map((registry, index) => [["types", "categories", "departments"][index], {
              total: payloadData(registry).total, rows: asRecords(payloadData(registry).rows),
              limit: "أول 100 سجل في كل تصنيف؛ استخدم معرّفات السجل عند الحاجة.",
            }])),
          } });
        } else setSnapshot({ rows: asRecords(data.rows), total: typeof data.total === "number" ? data.total : null, data });
      }
      if (section === "robot-knowledge" && !signal.aborted) {
        setCapabilities(payload.capabilities as DataCenterRecord ?? null);
        const grantsPayload = await dataCenterRequest(`${DATA_CENTER_API}?area=grants&limit=100`, { signal });
        if (!signal.aborted) setGrants(asRecords(payloadData(grantsPayload).rows));
      }
      if (section === "imports") {
        const overview = await dataCenterRequest(`${DATA_CENTER_API}?area=overview`, { signal });
        if (!signal.aborted) setCapabilities(overview.capabilities as DataCenterRecord ?? null);
      }
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : "تعذر تحميل البيانات.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
    if (metrics) {
      const state = await metrics;
      if (!signal.aborted) setPlatform(state);
    }
  }, [section, page, filters]);

  useEffect(() => {
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => void load(controller.signal));
    return () => { cancelAnimationFrame(frame); controller.abort(); };
  }, [load, refresh]);

  async function execute(payload: DataCenterRecord) {
    setBusy(true);
    setFeedback("");
    setError("");
    try {
      const result = await dataCenterRequest(DATA_CENTER_API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = payloadData(result);
      setFeedback(`تم حفظ الإجراء في مركز البيانات.${data.id ? ` المعرّف: ${String(data.id)}` : ""}`);
      setSelected(null);
      setForm(null);
      setRefresh((value) => value + 1);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ الإجراء.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openForm(key: string, fixed?: DataCenterRecord) {
    let command = DATA_CENTER_COMMANDS[key];
    if (key === "item") {
      command = { ...command, fields: command.fields.map((field) => field.name === "layer" && ["knowledge", "assets", "evidence"].includes(section)
          ? { ...field, defaultValue: "KNOWLEDGE" } : field) };
    }
    if (key === "version" && selected) {
      const current = asRecords(selected.versions)[0] ?? selected;
      command = { ...command, fields: command.fields.map((field) => {
        if (field.name === "reason") return field;
        const value = current[field.name] ?? selected[field.name];
        if (value === null || value === undefined) return field;
        const defaultValue = ["specialties", "missionContexts"].includes(field.name) && Array.isArray(value) ? value.join(", ")
          : field.name === "provenance" ? JSON.stringify(value)
          : field.kind === "datetime-local" ? new Date(new Date(String(value)).getTime() - new Date(String(value)).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
          : String(value);
        return { ...field, defaultValue };
      }) };
    }
    setForm({ definition: command, fixed });
    setFeedback("");
    if (key === "item" || key === "grantRobot") {
      try {
        const [sourcePayload, typePayload] = await Promise.all([
          dataCenterRequest(`${DATA_CENTER_API}?area=sources&limit=100`),
          dataCenterRequest(`${DATA_CENTER_API}?area=types&limit=100`),
        ]);
        setSources(asRecords(payloadData(sourcePayload).rows));
        setTypes(asRecords(payloadData(typePayload).rows));
      } catch {
        setError("تعذر تحميل خيارات المصادر والأنواع. يمكنك استخدام معرّفات مسجلة أو إعادة المحاولة.");
      }
    }
  }

  async function inspect(record: DataCenterRecord) {
    setSelected(record);
    if (areas[section] !== "items") return;
    setBusy(true);
    try {
      setSelected(payloadData(await dataCenterRequest(`${DATA_CENTER_API}?itemId=${encodeURIComponent(String(record.id))}`)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل تفاصيل السجل.");
    } finally { setBusy(false); }
  }

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPage(1);
    setFilters({ query: String(values.get("query") ?? ""), status: String(values.get("status") ?? ""), layer: String(values.get("layer") ?? "") });
  }

  async function retrieve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const params = new URLSearchParams({ query: String(values.get("query") ?? ""), mode: String(values.get("mode") ?? "keyword"), limit: "20" });
    for (const key of ["specialty", "missionContext", "typeKey", "organizationId", "categoryKey", "departmentKey"]) {
      const value = String(values.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    await retrievePage(params, 1);
  }

  async function retrievePage(params: URLSearchParams, nextPage: number) {
    params.set("page", String(nextPage));
    setBusy(true);
    setContext(null);
    setError("");
    setRetrievalParams(params.toString());
    try { setContext(payloadData(await dataCenterRequest(`/api/data-center/context?${params}`))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر استرجاع المعرفة."); }
    finally { setBusy(false); }
  }

  async function exportContext(format: "json" | "csv") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/data-center/export?${retrievalParams}&format=${format}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(dataCenterErrorMessage(response.status, await response.json().catch(() => null)));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `jenan-pro-data-center.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback("تم تنزيل التصدير المسموح وفق تراخيص المصادر. التصدير محدود بصفحة النتائج وليس نسخة احتياطية.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر التصدير."); }
    finally { setBusy(false); }
  }

  const isItemSection = areas[section] === "items";
  const semanticAvailable = (capabilities?.semantic as DataCenterRecord | undefined)?.available === true;
  return (
    <AdminShell>
      <main className={styles.workspace} dir="rtl" data-testid="data-center-workspace" data-section={section}>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>JENAN PRO · PLATFORM DATA CENTER / V1</span>
          <h1>{definition.title}</h1>
          <p>{definition.description}</p>
        </header>
        <div className={styles.layout}>
          <nav className={styles.navigation} aria-label="أقسام مركز البيانات">
            {DATA_CENTER_SECTIONS.map((item) => <Link key={item.key} href={dataCenterHref(item.key)} aria-current={item.key === section ? "page" : undefined} title={item.english}>{item.title}</Link>)}
          </nav>
          <div className={styles.content} aria-busy={loading || busy}>
            <Card className={styles.panel}>
              <div className={styles.toolbar}>
                <h2>{definition.english}</h2>
                <div className={styles.actions}>
                  <button className={`${styles.button} ${styles.secondary}`} disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)}>تحديث</button>
                  {isItemSection && !["publishing", "robot-knowledge", "versions"].includes(section) ? <button className={styles.button} disabled={busy} onClick={() => void openForm("item")}>إنشاء سجل</button> : null}
                  {section === "sources" ? <button className={styles.button} disabled={busy} onClick={() => void openForm("source")}>إضافة مصدر</button> : null}
                  {section === "conflicts" ? <button className={styles.button} disabled={busy} onClick={() => void openForm("conflict")}>تسجيل تعارض</button> : null}
                  {section === "academy" ? <><button className={styles.button} disabled={busy} onClick={() => void openForm("release")}>اقتراح إصدار</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => void openForm("academySource")}>ربط مصدر الأكاديمية</button></> : null}
                  {section === "settings" ? <><button className={styles.button} disabled={busy} onClick={() => void openForm("type")}>تسجيل نوع</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => void openForm("category")}>تسجيل فئة</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => void openForm("department")}>تسجيل قسم</button></> : null}
                  {section === "usage" ? <button className={styles.button} disabled={busy} onClick={() => void openForm("usage")}>تسجيل مرجع استخدام</button> : null}
                  {section === "evidence" ? <button className={styles.button} disabled={busy} onClick={() => void openForm("evidence")}>ربط دليل بإصدار</button> : null}
                </div>
              </div>
            </Card>
            {error ? <div className={`${styles.feedback} ${styles.error}`} role="alert">{error}</div> : null}
            {feedback ? <div className={styles.feedback} role="status">{feedback}</div> : null}
            {form ? <Card className={styles.panel}>
              <div className={styles.toolbar}><h2>{form.definition.title}</h2><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => setForm(null)}>إلغاء</button></div>
              <p className={styles.muted}>تُطبق صلاحيات المصدر وقواعد المراجعة في الخادم. لا يعني حفظ السجل اعتماده أو نشره.</p>
              <CommandForm key={`${form.definition.action}-${String(form.fixed?.itemId ?? "")}`} definition={form.definition} fixed={form.fixed} busy={busy} onSubmit={execute} sources={sources} types={types} />
            </Card> : null}
            {section === "overview" ? <>
              <section className={styles.stats} aria-label="إحصاءات السجلات">
                {Object.entries(statLabels).map(([key, label]) => <div key={key} className={styles.stat}><span>{label}</span><strong>{loading ? "…" : displayDataCenterValue(snapshot.data[key])}</strong></div>)}
              </section>
              <PlatformMetrics state={platform} />
              <Card className={styles.panel}><h2>من المصدر إلى المعرفة المنشورة</h2><p className={styles.muted}>أضف مصدراً ونوعاً، ثم أنشئ سجلاً، وأرسله للمراجعة البشرية. سجّل قرار المراجعة ثم اعتمد وانشر. المصادر غير المؤرخة والثقة التقديرية تظل واضحة للمستهلك.</p><div className={styles.links}>{(["sources", "data", "knowledge", "publishing"] as const).map((key) => { const item = findDataCenterSection(key)!; return <Link key={key} href={dataCenterHref(key)}>{item.title}<small>{item.description}</small></Link>; })}</div></Card>
              <Card className={styles.panel}><h2>سياسة التشغيل</h2><p className={styles.muted}>لا توجد مؤشرات صحة أو جاهزية مصطنعة. النسخ الاحتياطي للبنية الأساسية يُدار خارج هذه الواجهة؛ التصدير ليس نسخة استعادة.</p></Card>
            </> : null}
            {isItemSection ? <Card className={styles.panel}>
              <h2>{section === "publishing" ? "مراجعة واعتماد ونشر" : "تصفية السجلات"}</h2>
              {section === "assets" ? <p className={styles.muted}>الأصول تصنيف للمحتوى القابل لإعادة الاستخدام، وليست طبقة صلاحيات إضافية. استخدم نوعاً مسجلاً ضمن الفئة assets؛ تُدار الفئات والأقسام في الإعدادات.</p> : null}
              {section === "evidence" ? <p className={styles.muted}>عرض حالة الأدلة ومراجع المصدر للإصدارات. حالة VERIFIED لا تُمنح لمجرد اعتماد إداري.</p> : null}
              {section === "versions" ? <p className={styles.muted}>اختر سجلاً ثم افتح التفاصيل لعرض إصداراته ومراجعاته وبصمة محتواه. يُعرض حتى 100 إصدار لكل سجل وفق حد الخادم.</p> : null}
              {section === "publishing" ? <p className={styles.muted}>مسودة الإصدار الجديد لا تستبدل الإصدار المنشور السابق. يبقى الإصدار المنشور متاحاً حتى نشر بديل أو أرشفة السجل؛ كل إصدار جديد يحتاج مراجعته الخاصة.</p> : null}
              <form className={styles.form} onSubmit={filter}>
                <label>بحث بالعنوان<input name="query" type="search" maxLength={200} /></label>
                <label>الحالة<select name="status"><option value="">كل الحالات</option>{["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"].map((status) => <option key={status}>{status}</option>)}</select></label>
                <label>الطبقة<select name="layer" disabled={section === "data" || section === "knowledge"} defaultValue=""><option value="">كل الطبقات</option>{["DATA", "KNOWLEDGE", "INTELLIGENCE", "CONTEXT"].map((layer) => <option key={layer}>{layer}</option>)}</select></label>
                <div className={styles.actions}><button className={styles.button} disabled={loading} type="submit">تطبيق</button></div>
              </form>
              <p className={styles.muted}>الفئة والقسم مرتبطان بالنوع المسجل. أصل المحتوى يُحدد في الخادم؛ مصادر GENERATED تبقى اقتراحات ذكاء اصطناعي ولا تصبح مصادر موثقة تلقائياً.</p>
            </Card> : null}
            {section === "robot-knowledge" ? <Card className={styles.panel}>
              <h2>استرجاع سياق محدود الصلاحيات</h2><p className={styles.muted}>النتائج من الإصدارات المنشورة المتاحة فقط، ومحدودة العدد. لا تُرسل قاعدة المعرفة كاملة لأي نموذج.</p>
              <form onSubmit={retrieve} className={styles.form}>
                <label>الاستعلام<input name="query" type="search" maxLength={500} required /></label>
                <label>طريقة البحث<select name="mode"><option value="keyword">بحث بالكلمات</option><option value="semantic" disabled={!semanticAvailable}>{semanticAvailable ? "بحث دلالي" : "بحث دلالي — غير متاح"}</option></select></label>
                <label>التخصص<input name="specialty" maxLength={80} /></label><label>سياق المهمة<input name="missionContext" maxLength={80} /></label>
                <label>مفتاح النوع<input name="typeKey" maxLength={80} /></label><label>معرّف المؤسسة<input name="organizationId" maxLength={128} /></label>
                <label>مفتاح الفئة<input name="categoryKey" maxLength={80} /></label><label>مفتاح القسم<input name="departmentKey" maxLength={80} /></label>
                <button className={styles.button} type="submit" disabled={busy}>استرجاع المعرفة</button>
              </form>
              <p className={styles.muted}>التصدير يقتصر على صفحة النتائج المنشورة المسموح بإعادة توزيعها؛ قد يختلف عددها عن نتائج الاسترجاع.</p>
              <div className={styles.actions}><button className={styles.button} disabled={busy || context?.available !== true} onClick={() => void exportContext("json")}>تصدير JSON</button><button className={styles.button} disabled={busy || context?.available !== true} onClick={() => void exportContext("csv")}>تصدير CSV</button></div>
              {context ? <div className={styles.records}>{context.available === false ? <p role="status" className={styles.empty}>الاسترجاع غير متاح: {displayDataCenterValue(context.reason)}</p> : <><p className={styles.muted}>النتائج: {displayDataCenterValue(context.total)}{context.truncated ? " · البحث محدود بعينة مرشحة؛ ليست تغطية شاملة." : ""}</p>{asRecords(context.rows).map((record, index) => <article className={styles.record} key={String(record.versionId ?? index)}><RecordDetails record={record} /></article>)}{!asRecords(context.rows).length ? <p className={styles.empty}>لا توجد نتائج متاحة وفق النطاق والسياق المحددين.</p> : null}</>}</div> : null}
              {context?.available === true && Number(context.total) > Number(context.limit ?? 20) ? <div className={styles.pagination}>
                <button className={styles.button} disabled={busy || Number(context.page ?? 1) <= 1} onClick={() => void retrievePage(new URLSearchParams(retrievalParams), Number(context.page ?? 1) - 1)}>نتائج سابقة</button>
                <span>صفحة {displayDataCenterValue(context.page)}</span>
                <button className={styles.button} disabled={busy || Number(context.page ?? 1) >= 100 || Number(context.page ?? 1) * Number(context.limit ?? 20) >= Number(context.total)} onClick={() => void retrievePage(new URLSearchParams(retrievalParams), Number(context.page ?? 1) + 1)}>نتائج تالية</button>
              </div> : null}
            </Card> : null}
            {section === "robot-knowledge" ? <Card className={styles.panel}>
              <div className={styles.toolbar}><h2>منح وصول الروبوتات إلى المصادر</h2><button className={styles.button} disabled={busy} onClick={() => void openForm("grantRobot")}>منح وصول لروبوت</button></div>
              <p className={styles.muted}>لا يصل أي روبوت إلى مصدر دون منحة صريحة تحدد الروبوت والحساب والدور والتخصص والمهمة وتاريخ الانتهاء. منحة القراءة لا تتيح اقتراح محتوى، وتُسحب المنح ولا تُحذف.</p>
              {loading ? <p className={styles.empty} role="status">جارٍ تحميل المنح…</p> : !grants.length ? <p className={styles.empty}>لا توجد منح وصول للروبوتات.</p> : <div className={styles.records}>{grants.map((grant) => {
                const state = grantState(grant);
                return <article className={styles.record} key={String(grant.id)}>
                  <div className={styles.toolbar}><div><h3>{displayDataCenterValue((grant.source as DataCenterRecord | undefined)?.name ?? grant.sourceId)}</h3><small>{displayDataCenterValue(grant.roleKey)} · {displayDataCenterValue(grant.specialty)} · {displayDataCenterValue(grant.access)}</small></div>
                    <div className={styles.actions}><span className={styles.badge}>{grantStates[state]}</span><button className={`${styles.button} ${styles.secondary}`} disabled={busy || state !== "ACTIVE"} onClick={() => void openForm("revokeRobot", { grantId: grant.id })}>سحب الوصول</button></div></div>
                  <details><summary>تفاصيل المنحة</summary><RecordDetails record={grant} /></details>
                </article>;
              })}</div>}
            </Card> : null}
            {section === "imports" ? <ImportPanel capabilities={capabilities} busy={busy} setBusy={setBusy} onComplete={(message) => { setFeedback(message); setRefresh((value) => value + 1); }} onError={setError} /> : null}
            {section === "academy" ? <Card className={styles.panel}><h2>حوكمة محتوى الأكاديمية</h2><p className={styles.muted}>الاقتراح يربط إصداراً منشوراً بجهة تعليمية؛ لا ينسخ المحتوى تلقائياً إلى مكتبة الدورات ولا يحوّل المحتوى المولّد إلى مصدر موثوق.</p><button className={styles.button} disabled title="لا يوجد مولد محتوى أكاديمية في هذا الإصدار">توليد مادة تعليمية — غير متاح</button></Card> : null}
            {section === "settings" ? <Card className={styles.panel}><h2>السياسات والإمكانات</h2>{loading ? <p role="status">جارٍ تحميل السياسات…</p> : error ? <p className={styles.muted}>تعذر التحقق من إعدادات الخادم.</p> : <RecordDetails record={snapshot.data} />}<div className={styles.actions}><button className={styles.button} disabled title="إدارة النسخ الاحتياطية خارج مركز البيانات">استعادة قاعدة البيانات — غير متاحة هنا</button></div></Card> : null}
            {section !== "overview" && section !== "settings" && section !== "robot-knowledge" ? <Card className={styles.panel}>
              <div className={styles.toolbar}><h2>السجل</h2><span className={styles.muted}>{snapshot.total === null ? "العدد غير متاح" : `${snapshot.total} سجل`}</span></div>
              {loading ? <p className={styles.empty} role="status">جارٍ تحميل السجلات الفعلية…</p> : error && snapshot.total === null ? <p className={styles.empty}>البيانات غير متاحة؛ أعد المحاولة. لا يُفسر فشل التحميل على أنه سجل فارغ.</p> : !snapshot.rows.length ? <p className={styles.empty}>لا توجد سجلات تطابق هذا العرض. لم تُنشأ بيانات تجريبية.</p> : <div className={styles.records}>{snapshot.rows.map((record, index) => <article className={styles.record} key={String(record.id ?? index)}>
                <div className={styles.toolbar}><div><h3>{displayDataCenterValue(record.title ?? record.name ?? record.action ?? record.filename ?? record.id)}</h3><small>{displayDataCenterValue(record.typeKey ?? record.kind ?? record.createdAt)}</small></div><div className={styles.actions}><span className={styles.badge}>{displayDataCenterValue(record.status ?? record.evidenceStatus ?? record.action)}</span><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => void inspect(record)}>التفاصيل</button></div></div>
                <details><summary>المصدر والتصنيف</summary><RecordDetails record={record} /></details>
              </article>)}</div>}
              {snapshot.total !== null && snapshot.total > 20 ? <div className={styles.pagination}><button className={styles.button} disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>السابق</button><span>صفحة {page}</span><button className={styles.button} disabled={loading || page * 20 >= snapshot.total} onClick={() => setPage((value) => value + 1)}>التالي</button></div> : null}
            </Card> : null}
            {selected ? <Card className={styles.panel}>
              <div className={styles.toolbar}><h2>تفاصيل السجل والإصدارات</h2><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => setSelected(null)}>إغلاق</button></div>
              <RecordDetails record={selected} />
              <div className={styles.actions}>
                {isItemSection ? <>
                  <button className={styles.button} disabled={busy} onClick={() => void openForm("version", { itemId: selected.id })}>إصدار جديد</button>
                  <button className={styles.button} disabled={busy} onClick={() => void openForm("transition", { itemId: selected.id })}>تغيير الحالة / النشر</button>
                  <button className={styles.button} disabled={busy || selected.status !== "IN_REVIEW"} title="يجب أن يكون السجل قيد المراجعة" onClick={() => void openForm("review", { itemId: selected.id })}>مراجعة بشرية</button>
                </> : null}
                {section === "conflicts" ? <button className={styles.button} disabled={busy || !!selected.resolvedAt} onClick={() => void openForm("resolve", { conflictId: selected.id })}>حسم التعارض</button> : null}
                {section === "academy" ? <button className={styles.button} disabled={busy || selected.status !== "PENDING"} onClick={() => void openForm("approveRelease", { releaseId: selected.id })}>اعتماد الاقتراح</button> : null}
                {section === "imports" && selected.id ? <a className={styles.button} href={`${DATA_CENTER_API}/imports/${encodeURIComponent(String(selected.id))}/download`} download>تنزيل الملف الأصلي</a> : null}
                {section === "sources" ? <button className={styles.button} disabled title="لا توجد عملية تعديل مصدر في العقد الحالي">تعديل المصدر — غير متاح</button> : null}
              </div>
            </Card> : null}
          </div>
        </div>
      </main>
    </AdminShell>
  );
}

function ImportPanel({ capabilities, busy, setBusy, onComplete, onError }: {
  capabilities: DataCenterRecord | null; busy: boolean; setBusy: (value: boolean) => void; onComplete: (message: string) => void; onError: (message: string) => void;
}) {
  const imports = capabilities?.imports as DataCenterRecord | undefined;
  const scannerAvailable = (imports?.scanner as DataCenterRecord | undefined)?.available === true;
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    onError("");
    try {
      const data = new FormData(form);
      data.set("action", "import-file");
      const result = await dataCenterRequest(DATA_CENTER_API, { method: "POST", body: data });
      const item = payloadData(result).item as DataCenterRecord | undefined;
      onComplete(`تم استيراد الملف وحفظه للمراجعة قبل النشر.${item?.id ? ` معرّف السجل: ${String(item.id)}` : ""}`);
      form.reset();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "تعذر الاستيراد."); }
    finally { setBusy(false); }
  }
  return <Card className={styles.panel}>
    <h2>رفع ملف</h2><p className={styles.muted}>الرفع مشروط بمزود فحص ملفات آمن. يُرفض الملف إذا تعذر الفحص؛ لا يُنفذ محتواه. لا يوجد استيراد تلقائي من روابط خارجية.</p>
    <p className={styles.muted}>{capabilities ? scannerAvailable ? "مزود الفحص متاح. الملفات حتى 10 MB. ملفات PDF تحفظ كأصل فقط دون استخراج نص." : "الرفع غير متاح: لم يُهيأ مزود فحص الملفات." : "جارٍ التحقق من إمكانات الرفع؛ الزر معطل حتى التحقق."}</p>
    <form onSubmit={upload} className={styles.form} encType="multipart/form-data">
      <label>الملف<input type="file" name="file" accept=".csv,.json,.geojson,.pdf,.docx,.xlsx" required disabled={!scannerAvailable} /></label>
      <label>معرّف المصدر<input name="sourceId" required maxLength={128} /></label>
      <label>مفتاح النوع<input name="typeKey" required maxLength={80} /></label>
      <label>الطبقة<select name="layer">{["DATA", "KNOWLEDGE", "INTELLIGENCE", "CONTEXT"].map((layer) => <option key={layer}>{layer}</option>)}</select></label>
      <label className={styles.wide}>عنوان المحتوى<input name="title" required maxLength={240} /></label>
      <div className={`${styles.actions} ${styles.wide}`}><button className={styles.button} type="submit" disabled={busy || !scannerAvailable}>رفع وفحص واستيراد</button><button className={styles.button} disabled title="لا يوجد موصل API معتمد">استيراد API — غير متاح</button></div>
    </form>
  </Card>;
}
