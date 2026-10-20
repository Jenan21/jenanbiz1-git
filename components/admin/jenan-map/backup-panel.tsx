"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { MapActionConfirmation, type MapConfirmation } from "./confirmation";
import { displayDate, MapEmpty, MapPanel, MapTable } from "./display";
import { mapErrorMessage, type AdminMapSnapshot } from "./snapshot";

export type BackupListing = { configured: boolean; backups: Array<{ folder: string; modifiedAt: string }> };
export type BackupVerdict = { folder: string; ok: boolean; problems: Array<{ code: string; detail: string }>; mapVersion: string | null };

const API = "/api/admin/jenan-map/backup";
const problemLabels: Record<string, string> = {
  MANIFEST_MISSING: "ملف البيان manifest.json مفقود", MANIFEST_INVALID: "ملف البيان تالف", MANIFEST_DIGEST_MISMATCH: "بصمة ملف البيان لا تطابق محتواه",
  UNSUPPORTED_FORMAT: "صيغة نسخة غير مدعومة", NO_ARTIFACTS: "النسخة بلا ملفات", ARTIFACT_ENTRY_INVALID: "سجل ملف غير صالح في البيان",
  ARTIFACT_MISSING: "ملف مفقود من النسخة", ARTIFACT_SIZE_MISMATCH: "حجم ملف لا يطابق البيان", ARTIFACT_CHECKSUM_MISMATCH: "بصمة ملف لا تطابق البيان",
  UNEXPECTED_FILE: "ملف غير مسجل في البيان", REQUIRED_KIND_MISSING: "نوع ملف لازم غير موجود", SOURCE_REGISTRY_MISSING: "سجل المصادر فارغ",
  OWNERSHIP_INVALID: "تصنيف ملكية غير صالح", STYLE_TILES_MISMATCH: "النمط لا يشير إلى ملف البلاطات المحفوظ", STYLE_INVALID: "ملف النمط ليس JSON صالحاً",
};

/** The server answers `{ configured, backups }`; anything else is not a listing, so the panel says the state is unknown instead of guessing. */
export function readBackupListing(payload: unknown): BackupListing | null {
  const value = payload as Partial<BackupListing> | null;
  if (!value || typeof value.configured !== "boolean" || !Array.isArray(value.backups)) return null;
  const backups = value.backups.filter((item) => typeof item?.folder === "string" && typeof item?.modifiedAt === "string");
  return backups.length === value.backups.length ? { configured: value.configured, backups } : null;
}

export function readBackupVerdict(payload: unknown): BackupVerdict | null {
  const value = payload as Partial<BackupVerdict> | null;
  if (!value || typeof value.folder !== "string" || typeof value.ok !== "boolean" || !Array.isArray(value.problems)) return null;
  return { folder: value.folder, ok: value.ok, problems: value.problems.filter((item) => typeof item?.code === "string"), mapVersion: typeof value.mapVersion === "string" ? value.mapVersion : null };
}

export function backupProblemLabel(code: string) {
  return problemLabels[code] ?? "مشكلة غير معروفة في النسخة";
}

export function backupErrorMessage(code?: string, status?: number) {
  if (code === "BACKUP_ROOT_NOT_CONFIGURED") return "مجلد النسخ الاحتياطية غير مهيأ على الخادم (JENAN_MAP_BACKUP_ROOT).";
  if (code === "PRIVATE_BACKUP_ROOT_REQUIRED") return "مجلد النسخ الاحتياطية يجب أن يكون خاصاً، خارج public وخارج مجلد تخزين الخريطة.";
  if (code === "INVALID_BACKUP_NAME" || code === "INVALID_BACKUP_REQUEST") return "طلب النسخة الاحتياطية غير صالح.";
  if (code === "BACKUP_FOLDER_EXISTS") return "توجد نسخة بالاسم نفسه. أعد المحاولة بعد لحظات.";
  if (code === "BACKUP_NOT_RESTORABLE" || code === "BACKUP_INVALID") return "هذه النسخة لا يمكن استعادتها: تحقق منها أولاً وراجع المشكلات المعروضة.";
  if (code?.startsWith("BACKUP_") || code === "STYLE_REFERENCES_OTHER_RELEASE") return "تعذر إكمال العملية بسبب محتوى النسخة. لم يتغير الإنتاج؛ تحقق من النسخة ثم أعد المحاولة.";
  return mapErrorMessage(code, status);
}

export function MapBackupPanel({ snapshot, disabled, onSettled }: { snapshot: AdminMapSnapshot | null; disabled: boolean; onSettled: () => Promise<unknown> | void }) {
  const [listing, setListing] = useState<BackupListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [releaseId, setReleaseId] = useState("");
  const [verdicts, setVerdicts] = useState<Record<string, BackupVerdict>>({});
  const [pending, setPending] = useState<MapConfirmation | null>(null);
  const releases = (snapshot?.releases ?? []).filter((release) => ["Ready", "Approved", "Published", "Archived"].includes(release.status));
  const working = disabled || busy || loading;

  async function request(init?: RequestInit) {
    const response = await fetch(API, { cache: "no-store", credentials: "same-origin", ...init });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.error) throw new Error(backupErrorMessage(payload?.error, response.status));
    return payload;
  }
  const post = (body: Record<string, unknown>) => request({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  async function load() {
    setLoading(true);
    try {
      const next = readBackupListing(await request());
      if (!next) throw new Error("ردّ غير متوقع من الخادم. حالة النسخ الاحتياطية غير معروفة.");
      setListing(next);
    } catch (error) {
      setListing(null);
      setMessage(error instanceof Error ? error.message : backupErrorMessage());
    } finally { setLoading(false); }
  }
  const loadOnMount = useEffectEvent(() => { void load(); });
  useEffect(() => {
    const timer = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setMessage("");
    try { setMessage(await work()); }
    catch (error) { setMessage(error instanceof Error ? error.message : backupErrorMessage()); }
    finally { setPending(null); setBusy(false); await load(); await onSettled(); }
  }

  const create = () => run(async () => {
    const made = await post({ action: "create", releaseId, confirmation: "CREATE FULL BACKUP" });
    return `أُنشئت نسخة احتياطية كاملة وتحققت من كل ملف فيها: ${made.folder} (${made.artifacts} ملفاً). لم يتغير شيء لدى المستخدمين.`;
  });
  const validate = (folder: string) => run(async () => {
    const verdict = readBackupVerdict(await post({ action: "validate", folder }));
    if (!verdict) throw new Error("ردّ غير متوقع من الخادم.");
    setVerdicts((current) => ({ ...current, [folder]: verdict }));
    return verdict.ok ? `النسخة ${folder} سليمة وكاملة. الإنتاج لم يتغير.` : `النسخة ${folder} غير سليمة: ${verdict.problems.map((problem) => backupProblemLabel(problem.code)).join("، ")}.`;
  });
  const restore = (folder: string) => run(async () => {
    const restored = await post({ action: "restore", folder, confirmation: "RESTORE AS NEW CANDIDATE" });
    return `أُنشئ الإصدار المرشح ${restored.version} (جاهز للمراجعة، ${restored.features} ميزة). لم يُنشر ولم يتغير الإنتاج: عاينه ثم اعتمده وانشره من «الإصدارات».`;
  });

  const target = releases.find((release) => release.id === releaseId);
  return <>
    {message ? <div className="jenan-map-admin__notice" role="status">{message}</div> : null}
    <MapPanel title="نسخة احتياطية كاملة">
      <p>تحفظ كل ملفات الإصدار (البلاطات، النمط، الخطوط، البيانات القابلة للبحث، الحدود والمصادر الأصلية) مع بصمة كل ملف في مجلد خاص على الخادم. لا تغيّر ما يراه المستخدمون، وتحتوي أدلة مصدر خاصة فلا تُنقل إلى مكان عام.</p>
      {listing && !listing.configured ? <p role="status">مجلد النسخ الاحتياطية غير مهيأ (JENAN_MAP_BACKUP_ROOT)؛ لا يمكن إنشاء نسخة قبل تهيئته.</p> : null}
      <label>الإصدار<select value={releaseId} disabled={working || !listing?.configured} onChange={(event) => setReleaseId(event.target.value)}>
        <option value="">اختر إصداراً</option>
        {releases.map((release) => <option key={release.id} value={release.id}>{release.version}{release.id === snapshot?.runtime.publishedReleaseId ? " — منشور" : ""}</option>)}
      </select></label>
      <div className="jenan-map-admin__actions">
        <Button type="button" disabled={working || !listing?.configured || !target}
          onClick={() => setPending({ action: "backup", title: "إنشاء نسخة احتياطية كاملة", description: `ستُنسخ كل ملفات الإصدار ${target?.version ?? ""} إلى مجلد النسخ الخاص ثم يُتحقق من كل ملف. لا يتغير الإنتاج.`, requireReason: false })}>إنشاء نسخة احتياطية كاملة</Button>
      </div>
    </MapPanel>

    <MapPanel title="النسخ الموجودة والاستعادة">
      <p>الاستعادة لا تكتب على الإنتاج أبداً: <strong>تحقق ← استعادة كإصدار مرشح جديد ← معاينة إدارية ← اعتماد ← نشر</strong>، وكل خطوة بتأكيد إداري صريح.</p>
      {listing?.backups.length ? <MapTable headers={["النسخة", "آخر تعديل", "السلامة", "إجراءات"]}>{listing.backups.map((backup) => {
        const verdict = verdicts[backup.folder];
        return <tr key={backup.folder}>
          <td><bdi>{backup.folder}</bdi></td><td>{displayDate(backup.modifiedAt)}</td>
          <td>{verdict ? (verdict.ok ? "سليمة وكاملة" : verdict.problems.map((problem) => backupProblemLabel(problem.code)).join("، ")) : "لم يُتحقق منها"}</td>
          <td><div className="jenan-map-admin__actions">
            <Button type="button" variant="secondary" disabled={working} onClick={() => void validate(backup.folder)}>تحقق</Button>
            <Button type="button" disabled={working || !verdict?.ok} title={verdict?.ok ? undefined : "تحقق من النسخة أولاً"}
              onClick={() => setPending({ action: "restore", title: "استعادة نسخة كإصدار مرشح جديد", description: `ستُنشأ نسخة جديدة غير معتمدة من ${backup.folder}. لا يُنشر شيء ولا يتغير الإنتاج.`, values: { folder: backup.folder }, requireReason: false })}>استعادة كإصدار مرشح</Button>
          </div></td>
        </tr>;
      })}</MapTable> : <MapEmpty>{listing ? (listing.configured ? "لا توجد نسخ احتياطية بعد." : "مجلد النسخ الاحتياطية غير مهيأ على الخادم.") : "حالة النسخ الاحتياطية غير معروفة لأن الخادم لم يرد."}</MapEmpty>}
    </MapPanel>
    {pending && snapshot ? <MapActionConfirmation pending={pending} busy={busy} revision={snapshot.runtime.revision} publishedReleaseId={snapshot.runtime.publishedReleaseId}
      onCancel={() => setPending(null)} onConfirm={() => void (pending.action === "backup" ? create() : restore(String(pending.values?.folder)))} /> : null}
  </>;
}
