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
  logicalFilename?: string;
  mime: string;
  sha256: string;
  byteSize: string;
  publicSafe?: boolean;
  exportAllowed?: boolean;
  exportLicense?: string | null;
  url?: string;
};

export type AdminMapFacts = {
  postgis: { status: "available"; version: string } | { status: "unavailable" };
  activeLayers: number | null; datasets: number | null; features: number | null;
};

export type AdminMapSnapshot = {
  runtime: { status: string; publishedReleaseId: string | null; revision: number; maintenanceMessage?: string | null };
  releases: AdminMapRelease[];
  audit: { id: string; actorId: string; action: string; releaseId: string | null; createdAt: string; metadata?: Record<string, unknown> }[];
  blockers: string[];
  artifacts?: AdminMapArtifact[];
  capabilities?: string[];
  storage?: { status: string; message?: string };
  facts?: AdminMapFacts;
};

/** What the overview shows, derived only from what the server returned; `null` means "not known", never zero. */
export function overviewSummary(snapshot: AdminMapSnapshot | null) {
  if (!snapshot) return null;
  const active = snapshot.releases.find((release) => release.id === snapshot.runtime.publishedReleaseId);
  const tiles = (snapshot.artifacts ?? []).filter((artifact) => artifact.releaseId === snapshot.runtime.publishedReleaseId && artifact.kind === "pmtiles");
  const lastPublish = snapshot.audit.find((entry) => ["publish", "rollback"].includes(entry.action) && entry.releaseId === snapshot.runtime.publishedReleaseId);
  const bytes = tiles.reduce<bigint | null>((sum, artifact) => sum !== null && /^\d+$/.test(artifact.byteSize) ? sum + BigInt(artifact.byteSize) : null, BigInt(0));
  return {
    activeVersion: active?.version ?? null,
    lastUpdate: snapshot.releases.reduce<string | null>((latest, release) => !latest || release.createdAt > latest ? release.createdAt : latest, null),
    lastPublish: lastPublish?.createdAt ?? null,
    tilesBytes: active && tiles.length ? bytes : null,
    postgis: snapshot.facts?.postgis ?? null,
    datasets: snapshot.facts?.datasets ?? null,
    activeLayers: snapshot.facts?.activeLayers ?? null,
    features: snapshot.facts?.features ?? null,
  };
}

/** Binary units for a byte count; the figure is a stored file size, not a measured load size. */
export function formatBytes(value: bigint | null) {
  if (value === null) return "غير معروف";
  const units = ["بايت", "ك.ب", "م.ب", "ج.ب"];
  let size = Number(value), unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
  return `${unit ? size.toFixed(1) : size} ${units[unit]}`;
}

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
  return Boolean(value && /^\/api\/admin\/jenan-map\/(?:artifacts\/[a-zA-Z0-9-]+(?:\?(?:expires=\d+|download=1))?|export\?releaseId=[a-zA-Z0-9-]+)$/.test(value));
}

export function canDownloadMapArtifact(artifact: AdminMapArtifact) {
  return artifact.exportAllowed === true && Boolean(artifact.exportLicense?.trim()) && isAuthorizedMapUrl(artifact.url);
}

export function mapArtifactDownloadUrl(artifact: AdminMapArtifact) {
  if (!canDownloadMapArtifact(artifact)) return undefined;
  if (artifact.url!.endsWith("?download=1")) return artifact.url;
  return `${artifact.url}${artifact.url!.includes("?") ? "&" : "?"}download=1`;
}

export function mapErrorMessage(code?: string, status?: number) {
  if (status === 401 || status === 403) return "انتهت الجلسة أو لا تملك صلاحية الإدارة. أعد تسجيل الدخول بحساب إداري.";
  if (["STALE_REVISION", "STALE_PUBLISHED_POINTER", "CONCURRENT_CHANGE_RETRY"].includes(code ?? "")) return "تغيرت الحالة أثناء المراجعة. أُعيد تحميل الحالة؛ راجع مؤشر الإنتاج ثم أعد التأكيد يدوياً.";
  if (status === 503 || code === "MAP_NOT_CONFIGURED" || code === "DATABASE_UNAVAILABLE") return "بيانات الخريطة غير متاحة حالياً. قد تكون قاعدة البيانات أو تهيئة الخريطة غير متاحة؛ لا يمكن استنتاج الحالة التشغيلية.";
  if (code === "RELEASE_NOT_READY" || code === "REVIEW_REQUIRED") return "الإصدار غير جاهز أو لم تُستكمل مراجعته. تحقق من البيانات والملفات والتراخيص قبل الاعتماد والنشر.";
  if (code === "LAYER_DATA_UNAVAILABLE" || code === "LAYER_BINDINGS_REQUIRED" || code === "UNBOUND_PUBLIC_STYLE_LAYER" || code === "RELEASE_LAYERS_NOT_READY") return "الطبقة غير جاهزة: يلزم ربط موثّق بمعرّفات نمط الإصدار وبيانات المصدر قبل التفعيل.";
  if (code === "INTERNAL_LAYER_NOT_PUBLIC" || code === "INTERNAL_LAYER_IN_PUBLIC_STYLE") return "الطبقة داخلية ولا يمكن إتاحتها للجمهور.";
  if (code === "IMPORT_IN_PROGRESS") return "هذا الإصدار قيد الاستيراد بالفعل. حدّث الحالة ولا تكرر الطلب.";
  if (code === "INVALID_IMPORT_MANIFEST" || code === "INVALID_LAYER_BINDING" || code === "INVALID_LAYER_BINDINGS") return "بيان الاستيراد أو ربط الطبقات غير صالح. راجع أسماء الملفات ومعرّفات النمط والتصنيفات والترخيص.";
  if (code === "ONE_PUBLIC_STYLE_REQUIRED") return "يلزم ملف نمط عام واحد موثّق لهذا الإصدار قبل ربط الطبقات. استورده أولاً ثم أعد المحاولة.";
  if (code === "LAYER_BINDINGS_ALREADY_RETAINED") return "ربط الطبقات محفوظ بالفعل ولا يمكن استبداله. راجع المعاينة أو أنشئ إصداراً جديداً.";
  if (code === "INVALID_IMPORT_INPUT" || code === "INVALID_IMPORT_FORM" || code === "INVALID_STAGED_FILENAME") return "بيانات الاستيراد غير صالحة. راجع النوع والاسم والحجم والبصمة وإذن التصدير؛ لا تستخدم مسارات أو روابط خارجية.";
  if (code === "USE_LOCAL_IMPORT_FOR_LARGE_ARTIFACTS") return "الملف أكبر من حد الرفع. جهّزه في مجلد التخزين الخاص ثم اختر الاستيراد باسم الملف المجهّز.";
  if (code === "ARTIFACT_ALREADY_RETAINED") return "هذا الأصل محفوظ بالفعل ولا يمكن استبداله. حدّث قائمة الملفات وراجع الإصدار والبصمة.";
  if (code === "IMPORT_REQUIRES_UNREVIEWED_RELEASE") return "تغيّرت حالة الإصدار أو اكتملت مراجعته. لا يُسمح بإضافة الملفات بعد الاعتماد؛ اختر مسودة جديدة.";
  return "تعذر إتمام الطلب. لم يُؤكد أي تغيير؛ حدّث الحالة قبل محاولة الإجراء مجدداً.";
}
