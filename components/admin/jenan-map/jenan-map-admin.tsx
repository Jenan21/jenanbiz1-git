"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { mapAdminSections, type MapAdminSection } from "./sections";
import { MapActionConfirmation, type MapConfirmation } from "./confirmation";
import { displayDate, MapEmpty, MapPanel, MapTable } from "./display";
import { canDownloadMapArtifact, canMapAction, formatBytes, mapArtifactDownloadUrl, mapErrorMessage, overviewSummary, readMapSnapshot, type AdminMapRelease, type AdminMapSnapshot } from "./snapshot";
import { MapLayerCatalog } from "./layer-catalog";
import { MapArtifactImport } from "./artifact-import";
import { MapBackupPanel } from "./backup-panel";
import { MapExportPanel } from "./export-panel";
import { MapHealthPanel } from "./health-panel";
import { MapLayerBinding } from "./layer-binding";
import { MAP_STOPPED_MESSAGE } from "@/services/jenan-map/messages";

const releaseLabels: Record<string, string> = { Draft: "مسودة", Processing: "قيد المعالجة", Importing: "قيد الاستيراد", Ready: "جاهز للمراجعة", Approved: "معتمد", Published: "منشور", Archived: "مؤرشف", Failed: "فشل" };
const runtimeLabels: Record<string, string> = { enabled: "مفعّل", maintenance: "صيانة", disabled: "معطّل" };

export function JenanMapAdmin({ section }: { section: MapAdminSection }) {
  const [snapshot, setSnapshot] = useState<AdminMapSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [pending, setPending] = useState<MapConfirmation | null>(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string>(MAP_STOPPED_MESSAGE);
  const [runtimeStatus, setRuntimeStatus] = useState("maintenance");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/jenan-map", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => null);
      const data = readMapSnapshot(payload);
      if (!response.ok || !data) {
        throw new Error(mapErrorMessage(payload?.code ?? payload?.error, payload?.available === false ? 503 : response.status));
      }
      setSnapshot(data);
      setLoadedAt(new Date().toISOString());
      setMaintenanceMessage(data.runtime.maintenanceMessage ?? MAP_STOPPED_MESSAGE);
      setRuntimeStatus(data.runtime.status);
      return true;
    } catch (error) {
      setSnapshot(null);
      setLoadedAt(null);
      setMessage(error instanceof Error ? error.message : mapErrorMessage());
      return false;
    } finally {
      setLoading(false);
    }
  }

  const loadOnMount = useEffectEvent(() => { void load(); });
  useEffect(() => {
    const timer = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function execute(values: Record<string, unknown>) {
    if (!snapshot || loading || busy || !canMapAction(snapshot, String(values.action))) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/jenan-map", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json().catch(() => null);
      setPending(null);
      if (!response.ok || !payload || payload.success === false || payload.error) {
        await load();
        setMessage(mapErrorMessage(payload?.code ?? payload?.error, response.status));
        return;
      }
      const refreshed = await load();
      if (refreshed) setMessage("تم حفظ الإجراء على الخادم وتحديث الحالة. هذا لا يعني قبول بيانات الخريطة أو اجتياز الاختبارات التشغيلية.");
    } catch {
      setPending(null);
      setSnapshot(null);
      setMessage("انقطع الاتصال ولم يُؤكد الحفظ. حدّث الحالة قبل إعادة المحاولة؛ قد يكون الخادم أتم الإجراء.");
    } finally {
      setBusy(false);
    }
  }

  function confirmAction(reason: string) {
    if (!pending || !snapshot) return;
    const confirmation = pending.action === "runtime" ? "CHANGE RUNTIME" : pending.action.toUpperCase();
    void execute({
      action: pending.action,
      ...(pending.versionId ? { releaseId: pending.versionId } : {}),
      ...pending.values,
      ...(["publish", "rollback", "runtime"].includes(pending.action) ? {
        expectedRevision: snapshot.runtime.revision,
      } : {}),
      ...(["publish", "rollback"].includes(pending.action) ? { expectedPublishedReleaseId: snapshot.runtime.publishedReleaseId } : {}),
      reason,
      confirmation,
    });
  }

  function createRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const sourceDate = String(data.get("sourceDate") ?? "");
    if (!sourceDate || !canMapAction(snapshot, "create")) return;
    void execute({ action: "create", version: data.get("version"), source: data.get("source"), sourceDate: new Date(`${sourceDate}T00:00:00.000Z`).toISOString(), license: data.get("license") });
  }

  const actionEnabled = (action: string) => !loading && !busy && canMapAction(snapshot, action);
  const releases = snapshot?.releases ?? [];
  const artifacts = snapshot?.artifacts ?? [];
  const active = releases.find((release) => release.id === snapshot?.runtime.publishedReleaseId);
  const summary = overviewSummary(snapshot);
  const title = mapAdminSections.find(([key]) => key === section)?.[1] ?? "نظرة عامة";

  function releaseActions(release: AdminMapRelease) {
    const actions = [
      ["approve", "اعتماد", release.status === "Ready", "اعتماد مراجعة الإصدار", "اعتماد المراجعة لا ينشر الإصدار. تأكد من المصدر والتاريخ والترخيص والبيانات الفعلية."],
      ["publish", "نشر", release.status === "Approved", "نشر إصدار للإنتاج", "سيستبدل هذا الإصدار مؤشر الإنتاج الحالي بعد تحقق الخادم من المراجعة والملفات."],
      ["rollback", "استرجاع", release.status === "Archived" && Boolean(release.publishedAt), "استرجاع إصدار سابق", "سيعود مؤشر الإنتاج إلى هذا الإصدار المنشور سابقاً بعد إعادة التحقق منه."],
      ["archive", "أرشفة", ["Approved", "Published"].includes(release.status) && release.id !== snapshot?.runtime.publishedReleaseId, "أرشفة الإصدار", "لن يبقى الإصدار متاحاً للنشر المباشر. لا يمكن أرشفة مؤشر الإنتاج الحالي."],
    ] as const;
    return <div className="jenan-map-admin__actions">
      {actions.map(([action, label, eligible, actionTitle, description]) => <Button key={action} type="button" variant="secondary" disabled={!eligible || !actionEnabled(action)} title={!canMapAction(snapshot, action) ? "الإجراء غير متاح من الخادم" : !eligible ? "حالة الإصدار لا تسمح بهذا الإجراء" : actionTitle} onClick={() => setPending({ action, title: actionTitle, description, versionId: release.id })}>{label}</Button>)}
      {actionEnabled("preview") && ["Ready", "Approved", "Published", "Archived"].includes(release.status) ? <Link href={`/jenan-map?preview=${encodeURIComponent(release.id)}`} target="_blank" rel="noopener noreferrer">معاينة إدارية</Link> : <Button type="button" variant="ghost" disabled title="المعاينة غير متاحة لهذا الإصدار من الخادم">معاينة غير متاحة</Button>}
    </div>;
  }

  const versionsPanel = <MapPanel title="دورة حياة الإصدارات">
    <p>مسودة ← استيراد ملفات مملوكة ← جاهز للمراجعة ← معاينة إدارية ← اعتماد بشري ← نشر. النشر والاسترجاع يستخدمان مراجعة الحالة ومؤشر الإنتاج المتوقع؛ لا تُغيّر المسودة الإنتاج.</p>
    {releases.length ? releases.map((release) => <article className="jenan-map-admin__panel" key={release.id}>
      <h3><bdi>{release.version}</bdi> <span className="jenan-map-admin__badge">{releaseLabels[release.status] ?? "حالة غير معروفة"}</span></h3>
      <dl><dt>معرّف الإصدار</dt><dd><code>{release.id}</code></dd><dt>المصدر</dt><dd>{release.source || "غير متاح"}</dd><dt>تاريخ المصدر</dt><dd>{displayDate(release.sourceDate)}</dd><dt>الترخيص</dt><dd>{release.license || "غير متاح"}</dd><dt>تاريخ المراجعة</dt><dd>{displayDate(release.reviewedAt)}</dd><dt>ملاحظات المراجعة</dt><dd>{release.reviewNotes || "لا توجد مراجعة مسجلة"}</dd><dt>أول نشر</dt><dd>{displayDate(release.publishedAt)}</dd></dl>
      {release.failure ? <p role="status">توقفت معالجة الإصدار. راجع سجلات التشغيل قبل أي اعتماد.</p> : null}
      {releaseActions(release)}
    </article>) : <MapEmpty>{snapshot ? "لا توجد إصدارات مسجلة؛ البيانات الفعلية غائبة ولا يوجد قبول تشغيلي مثبت." : "حالة الإصدارات غير معروفة لأن المصدر غير متاح."}</MapEmpty>}
  </MapPanel>;

  return <main className="jenan-map-admin" dir="rtl" data-admin-operation="jenan-map" aria-busy={loading || busy}>
    <header className="jenan-map-admin__hero"><div><span className="jenan-map-admin__eyebrow">JENAN PRO MAP · ADMIN CONTROL</span><h1>{title}</h1><p>إدارة مستقلة لبيانات خريطة جنان برو، من المصدر والترخيص إلى المعاينة والنشر الآمن. تكاملات الخرائط الحالية لا تتغير.</p></div><Button variant="secondary" disabled={loading || busy} onClick={() => { setMessage(""); void load(); }}>{loading ? "جارٍ التحميل…" : "تحديث الحالة"}</Button></header>
    <nav className="jenan-map-admin__nav" aria-label="أقسام إدارة خريطة جنان برو">{mapAdminSections.map(([key, label]) => <Link key={key} href={key === "overview" ? "/admin/jenan-map" : `/admin/jenan-map/${key}`} aria-current={key === section ? "page" : undefined}>{label}</Link>)}</nav>
    {message ? <div className="jenan-map-admin__notice" role="status">{message}</div> : null}
    {!snapshot && !loading ? <div className="jenan-map-admin__notice">المصدر غير متاح. الإصدارات والعدادات والحالة الصحية غير معروفة، وجميع إجراءات التغيير معطلة.</div> : null}
    <div className="jenan-map-admin__notice">{releases.some((release) => ["Ready", "Approved", "Published", "Archived"].includes(release.status)) ? "الإصدارات المسجلة لا تثبت القبول التشغيلي: راجع المعاينة والحدود والتراخيص وسلامة الملفات قبل النشر." : "لا توجد مجموعة بيانات سعودية فعلية مرفقة بهذا التسليم؛ لا تُعد البنية أو بيانات الإصدارات الوصفية دليلاً على استيراد البيانات أو القبول التشغيلي."}</div>

    {section === "overview" ? <>
      <section className="jenan-map-admin__grid" aria-label="حالة الخريطة">
        {[
          ["حالة التشغيل", snapshot ? runtimeLabels[snapshot.runtime.status] ?? "غير معروفة" : "غير معروفة"],
          ["إصدار الإنتاج", active?.version ?? (snapshot?.runtime.publishedReleaseId ? "مؤشر غير متحقق" : snapshot ? "لا يوجد إصدار منشور" : "غير معروف")],
          ["آخر تحديث للإصدارات", displayDate(summary?.lastUpdate)],
          ["آخر نشر أو استرجاع", displayDate(summary?.lastPublish)],
          ["حجم ملف PMTiles المنشور", formatBytes(summary?.tilesBytes ?? null)],
          ["مجموعات البيانات في الإصدار المنشور", summary?.datasets === null || summary?.datasets === undefined ? "غير معروف" : String(summary.datasets)],
          ["الطبقات الفعالة", summary?.activeLayers === null || summary?.activeLayers === undefined ? "غير معروف" : String(summary.activeLayers)],
          ["PostGIS", summary?.postgis ? (summary.postgis.status === "available" ? `متاح (${summary.postgis.version})` : "غير متاح") : "غير معروف"],
          ["التخزين وCDN", `${snapshot?.storage?.status === "available" ? "التخزين مهيأ" : snapshot ? "التخزين غير متاح" : "التخزين غير معروف"} · CDN غير مقيس`],
          ["إصدارات ضمن القراءة", snapshot ? String(releases.length) : "غير معروف"],
          ["مراجعة الحالة", snapshot ? String(snapshot.runtime.revision) : "غير معروفة"],
        ].map(([label, value]) => <MapPanel key={label} title={label}><strong className="jenan-map-admin__metric">{value}</strong></MapPanel>)}
      </section>
      <MapPanel title="مؤشر الإنتاج وحواجز القبول"><dl><dt>المؤشر الحالي</dt><dd><code>{snapshot?.runtime.publishedReleaseId ?? (snapshot ? "لا يوجد" : "غير معروف")}</code></dd><dt>آخر قراءة</dt><dd>{displayDate(loadedAt)}</dd><dt>قبول البيانات</dt><dd>غير مثبت — يلزم استيراد ومراجعة وقياس فعلي</dd></dl>{snapshot?.blockers.length ? <ul>{snapshot.blockers.map((blocker) => <li key={blocker}><code>{blocker}</code></li>)}</ul> : null}<div className="jenan-map-admin__actions"><Link href="/admin/jenan-map/versions">مراجعة الإصدارات</Link><Link href="/admin/jenan-map/health">حالة التشغيل</Link><Link href="/admin/map-provider">تكاملات الخرائط الحالية</Link></div></MapPanel>
    </> : null}

    {section === "versions" ? versionsPanel : null}
    {section === "updates" ? <>
      <MapPanel title="سجل التحديثات"><p>كل إصدار مستقل عن الإنتاج حتى اكتمال مراجعة ونشر صريحين. الملفات تُستورد إلى تخزين خاص ولا تُرفع إلى رابط عام.</p>{releases.length ? <MapTable headers={["الإصدار", "الحالة", "إنشاء", "المصدر", "تاريخ المصدر"]}>{releases.map((release) => <tr key={release.id}><td>{release.version}</td><td>{releaseLabels[release.status] ?? "غير معروفة"}</td><td>{displayDate(release.createdAt)}</td><td>{release.source}</td><td>{displayDate(release.sourceDate)}</td></tr>)}</MapTable> : <MapEmpty />}</MapPanel>
      <MapPanel title="إنشاء بيانات وصفية لمسودة"><p>هذا النموذج يسجل المصدر والتاريخ والترخيص فقط، ولا يرفع بيانات أو ينشئ مجموعة بيانات ولا يثبت جاهزيتها.</p><form onSubmit={createRelease}>
        <label>الإصدار<input name="version" required maxLength={80} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}" dir="ltr" disabled={!actionEnabled("create")} /></label>
        <label>المصدر<input name="source" required minLength={3} maxLength={1000} disabled={!actionEnabled("create")} /></label>
        <label>تاريخ المصدر (UTC)<input name="sourceDate" type="date" required max={new Date().toISOString().slice(0, 10)} disabled={!actionEnabled("create")} /></label>
        <label>الترخيص وشروط الاستخدام<textarea name="license" required minLength={3} maxLength={2000} disabled={!actionEnabled("create")} /></label>
        <Button type="submit" disabled={!actionEnabled("create")}>حفظ مسودة وصفية</Button>
      </form>{!canMapAction(snapshot, "create") ? <p>إنشاء المسودة غير متاح من الخادم؛ النموذج معطّل.</p> : null}</MapPanel>
      <MapArtifactImport snapshot={snapshot} disabled={loading || busy} onSettled={load} onBusyChange={setBusy} />
    </> : null}

    {section === "sources" ? <MapPanel title="المصادر وتواريخها وتراخيصها">{releases.length ? <MapTable headers={["الإصدار", "المصدر", "تاريخ المصدر", "الترخيص", "المراجعة"]}>{releases.map((release) => <tr key={release.id}><td>{release.version}</td><td>{release.source || "غير متاح"}</td><td>{displayDate(release.sourceDate)}</td><td>{release.license || "غير متاح"}</td><td>{release.reviewedAt ? displayDate(release.reviewedAt) : "لم يُراجع"}</td></tr>)}</MapTable> : <MapEmpty />}</MapPanel> : null}

    {section === "layers" ? <><MapLayerBinding snapshot={snapshot} disabled={loading || busy} onSettled={load} onBusyChange={setBusy} /><MapLayerCatalog activeReleaseId={snapshot?.runtime.publishedReleaseId ?? null} disabled={loading || busy} /><MapPanel title="طبقات البيانات المسجلة"><p>تُعرض الملفات المسجلة فقط؛ لا تعني تهيئة الطبقة اكتمال تغطيتها أو قبول دقتها.</p>{artifacts.filter((artifact) => artifact.kind === "geojson").length ? <MapTable headers={["الطبقة", "الإصدار", "المصدر", "تاريخ المصدر", "الترخيص", "إتاحة الجمهور"]}>{artifacts.filter((artifact) => artifact.kind === "geojson").map((artifact) => { const release = releases.find((item) => item.id === artifact.releaseId); return <tr key={artifact.id}><td>{artifact.filename}</td><td>{release?.version ?? "غير معروف"}</td><td>{release?.source ?? "غير متاح"}</td><td>{displayDate(release?.sourceDate)}</td><td>{release?.license ?? "غير متاح"}</td><td>{artifact.publicSafe === true ? "ملف مصنف آمناً؛ النشر مستقل" : artifact.publicSafe === false ? "إداري فقط" : "غير معروفة"}</td></tr>; })}</MapTable> : <MapEmpty>{snapshot?.artifacts ? "لا توجد طبقات بيانات مسجلة. البيانات غائبة." : "لم تتوفر قائمة طبقات موثقة من الخادم؛ الحالة غير معروفة."}</MapEmpty>}</MapPanel></> : null}

    {section === "storage" ? <MapPanel title="التخزين والتصدير الإداري"><p>حالة التخزين: {snapshot?.storage?.status === "available" ? "مهيأ — سلامة كل ملف تتحقق عند القراءة" : "غير متاحة أو غير معروفة"}. التصدير قائمة manifest وملفات منفصلة عبر نقاط وصول إدارية محمية؛ لا توجد حزمة وهمية أو رفع إلى روابط عامة.</p>
      {releases.map((release) => <div className="jenan-map-admin__actions" key={release.id}><span>{release.version}</span>{actionEnabled("export") && artifacts.some((artifact) => artifact.releaseId === release.id && canDownloadMapArtifact(artifact)) ? <a href={`/api/admin/jenan-map/export?releaseId=${encodeURIComponent(release.id)}`} download>تنزيل manifest الإصدار</a> : <Button disabled variant="ghost" title="لا توجد ملفات ذات إذن تصدير موثق">تصدير غير متاح</Button>}</div>)}
      {artifacts.length ? <MapTable headers={["الملف", "النوع", "الحجم بالبايت", "SHA-256", "ترخيص التصدير", "تنزيل"]}>{artifacts.map((artifact) => <tr key={artifact.id}><td><bdi>{artifact.logicalFilename ?? artifact.filename}</bdi></td><td>{artifact.kind}</td><td>{artifact.byteSize}</td><td><code>{artifact.sha256}</code></td><td>{artifact.exportAllowed === true ? artifact.exportLicense || "الإذن غير موثق" : "التصدير غير مسموح أو غير موثق"}</td><td>{actionEnabled("artifact-download") && canDownloadMapArtifact(artifact) ? <a href={mapArtifactDownloadUrl(artifact)} download>تنزيل إداري</a> : <Button type="button" disabled variant="ghost" title="يلزم إذن تصدير موثق ورابط إداري من الخادم">تنزيل غير متاح</Button>}</td></tr>)}</MapTable> : <MapEmpty>{snapshot?.artifacts ? "لا توجد ملفات مسجلة للتصدير." : "قائمة الملفات غير متاحة من الخادم."}</MapEmpty>}
    </MapPanel> : null}

    {section === "backup" ? <><MapBackupPanel snapshot={snapshot} disabled={loading || busy} onSettled={load} /><MapExportPanel activeReleaseId={snapshot?.runtime.publishedReleaseId ?? null} disabled={loading || busy} /></> : null}

    {section === "health" ? <MapHealthPanel disabled={loading || busy} /> : null}

    {section === "audit" ? <MapPanel title="سجل الإجراءات الإداري">{snapshot?.audit.length ? <MapTable headers={["الوقت", "الإجراء", "المستخدم", "الإصدار", "سبب الإجراء"]}>{snapshot.audit.map((entry) => <tr key={entry.id}><td>{displayDate(entry.createdAt)}</td><td><bdi>{entry.action}</bdi></td><td><code>{entry.actorId}</code></td><td><code>{entry.releaseId ?? "إعداد تشغيل"}</code></td><td>{typeof entry.metadata?.reason === "string" ? entry.metadata.reason : "غير مسجل"}</td></tr>)}</MapTable> : <MapEmpty>{snapshot ? "لا توجد إجراءات تدقيق مسجلة ضمن نافذة القراءة الحالية." : "سجل التدقيق غير متاح."}</MapEmpty>}</MapPanel> : null}

    {section === "settings" ? <MapPanel title="سياسة التشغيل ورسالة الصيانة"><p>تُحفظ الحالة ورسالة الصيانة في الخادم. تعطيل الخدمة أو تغيير رسالة الصيانة يتطلب تأكيداً وسبباً مسجلاً، ولا يغيّر إعدادات الخرائط الحالية.</p><form onSubmit={(event) => { event.preventDefault(); setPending({ action: "runtime", title: runtimeStatus === "disabled" ? "تأكيد تعطيل الخريطة" : "تأكيد تغيير التشغيل", description: "سيغيّر هذا الإجراء إتاحة خريطة جنان برو للمستخدمين، مع إبقاء مؤشر الإصدار محفوظاً.", values: { status: runtimeStatus, maintenanceMessage: runtimeStatus === "maintenance" ? maintenanceMessage.trim() : null } }); }}>
      <label>حالة التشغيل<select value={runtimeStatus} disabled={!actionEnabled("runtime")} onChange={(event) => setRuntimeStatus(event.target.value)}><option value="enabled" disabled={!snapshot?.runtime.publishedReleaseId}>مفعّل — يتطلب إصداراً منشوراً صالحاً</option><option value="maintenance">صيانة</option><option value="disabled">معطّل</option></select></label>
      <label>رسالة الصيانة العربية<textarea value={maintenanceMessage} required={runtimeStatus === "maintenance"} minLength={8} maxLength={1000} disabled={!actionEnabled("runtime") || runtimeStatus !== "maintenance"} onChange={(event) => setMaintenanceMessage(event.target.value)} placeholder={MAP_STOPPED_MESSAGE} /></label>
      <Button type="submit" disabled={!actionEnabled("runtime")}>مراجعة وتأكيد التغيير</Button>
    </form>{!canMapAction(snapshot, "runtime") ? <p>إجراء إعدادات التشغيل غير متاح من الخادم؛ الحفظ معطّل.</p> : null}</MapPanel> : null}
    {pending && snapshot ? <MapActionConfirmation key={`${pending.action}-${pending.versionId ?? ""}`} pending={pending} busy={busy} revision={snapshot.runtime.revision} publishedReleaseId={snapshot.runtime.publishedReleaseId} onCancel={() => setPending(null)} onConfirm={confirmAction} /> : null}
  </main>;
}
