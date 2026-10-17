export type AdminMapRelease = {
  id: string;
  version: string;
  status: string;
  source: string;
  sourceDate: string;
  license: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  publishedAt: string | null;
  failure: string | null;
};

export type AdminMapArtifact = {
  id: string;
  releaseId: string;
  kind: string;
  filename: string;
  mime: string;
  sha256: string;
  byteSize: string;
  publicSafe?: boolean;
  url?: string;
};

export type AdminMapSnapshot = {
  runtime: { status: string; publishedReleaseId: string | null; revision: number; maintenanceMessage?: string | null };
  releases: AdminMapRelease[];
  audit: { id: string; actorId: string; action: string; releaseId: string | null; createdAt: string; metadata?: Record<string, unknown> }[];
  blockers: string[];
  artifacts?: AdminMapArtifact[];
  capabilities?: string[];
  storage?: { status: string; message?: string };
};

export function readMapSnapshot(payload: unknown): AdminMapSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as Record<string, unknown>;
  if (envelope.success === false || envelope.error) return null;
  const data = (envelope.snapshot ?? envelope) as Record<string, unknown>;
  if (!data || typeof data !== "object" || data.available === false) return null;
  const runtime = data.runtime as AdminMapSnapshot["runtime"] | undefined;
  if (!runtime || !Number.isSafeInteger(runtime.revision) || runtime.revision < 0 || typeof runtime.status !== "string") return null;
  if (runtime.publishedReleaseId !== null && typeof runtime.publishedReleaseId !== "string") return null;
  if (!Array.isArray(data.releases) || !Array.isArray(data.audit) || !Array.isArray(data.blockers)) return null;
  if (data.capabilities !== undefined && (!Array.isArray(data.capabilities) || !data.capabilities.every((item) => typeof item === "string"))) return null;
  return data as AdminMapSnapshot;
}

export function canMapAction(snapshot: AdminMapSnapshot | null, action: string) {
  return Boolean(snapshot?.capabilities?.includes(action));
}

export function isAuthorizedMapUrl(value: string | undefined) {
  return Boolean(value && /^\/api\/admin\/jenan-map\/(?:artifacts\/[a-zA-Z0-9-]+(?:\?expires=\d+)?|export\?releaseId=[a-zA-Z0-9-]+)$/.test(value));
}

export function mapErrorMessage(code?: string, status?: number) {
  if (status === 401 || status === 403) return "انتهت الجلسة أو لا تملك صلاحية الإدارة. أعد تسجيل الدخول بحساب إداري.";
  if (status === 409 || code === "STALE_REVISION" || code === "CONCURRENT_CHANGE_RETRY") return "تغيرت الحالة أثناء المراجعة. أُعيد تحميل الحالة؛ راجع مؤشر الإنتاج ثم أعد التأكيد يدوياً.";
  if (status === 503 || code === "MAP_NOT_CONFIGURED" || code === "DATABASE_UNAVAILABLE") return "بيانات الخريطة غير متاحة حالياً. قد تكون قاعدة البيانات أو تهيئة الخريطة غير متاحة؛ لا يمكن استنتاج الحالة التشغيلية.";
  if (code === "RELEASE_NOT_READY" || code === "REVIEW_REQUIRED") return "الإصدار غير جاهز أو لم تُستكمل مراجعته. تحقق من البيانات والملفات والتراخيص قبل الاعتماد والنشر.";
  return "تعذر إتمام الطلب. لم يُؤكد أي تغيير؛ حدّث الحالة قبل محاولة الإجراء مجدداً.";
}
