/** A failed call to the projects API, kept as status and code only so no raw server text can reach a screen. */
export class AnalysisRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterMs?: number;

  constructor(status: number, code?: string, retryAfterMs?: number) {
    super(`The analysis request failed (${status})`);
    this.name = "AnalysisRequestError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export function retryAfterMilliseconds(value: string | null, now = Date.now()): number {
  if (!value) return 60_000;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(1000, delay) : 60_000;
}

export function analysisSignInHref(returnPath: string) {
  return `/auth?next=${encodeURIComponent(returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/projects/analysis")}`;
}

export function analysisReturnPath(route: string, query: Record<string, string | string[] | undefined> = {}) {
  const path = /^\/projects(?:\/[a-z0-9-]+)*$/.test(route) ? route : "/projects/analysis";
  const params = new URLSearchParams();
  for (const key of ["project", "run"]) {
    const value = query[key];
    if (typeof value === "string" && value.length <= 200) params.set(key, value);
  }
  return `${path}${params.size ? `?${params}` : ""}`;
}

export async function analysisCommand<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new AnalysisRequestError(response.status, payload?.code, response.status === 429 ? retryAfterMilliseconds(response.headers.get("retry-after")) : undefined);
  }
  return payload.result as T;
}

/** What the person reads when a step fails: one calm sentence in their language, never a provider or API message. */
export function analysisFailureMessage(error: unknown, ar: boolean) {
  const failure = error instanceof AnalysisRequestError ? error : undefined;
  if (failure?.code === "UNREADABLE_TEXT") {
    return ar ? "تعذر فهم وصف الفكرة. اكتبها بجمل واضحة تصف المشروع ثم أعد المحاولة." : "The idea could not be understood. Describe the project in clear sentences and try again.";
  }
  if (failure?.code === "EMAIL_NOT_VERIFIED") {
    return ar ? "فعّل بريدك الإلكتروني أولًا ثم أعد المحاولة." : "Verify your e-mail address first, then try again.";
  }
  if (failure?.status === 401) return ar ? "انتهت جلستك. سجّل الدخول ثم أعد المحاولة." : "Your session has ended. Sign in and try again.";
  if (failure?.status === 429) {
    const seconds = Math.ceil((failure.retryAfterMs ?? 60_000) / 1000);
    return ar ? `طلبات كثيرة خلال وقت قصير. أعد المحاولة بعد ${seconds} ثانية.` : `Too many requests. Try again in ${seconds} seconds.`;
  }
  if (failure?.status === 404) return ar ? "تعذر العثور على المشروع. ابدأ تحليلًا جديدًا." : "The project could not be found. Start a new analysis.";
  if (!failure || failure.status === 0) return ar ? "تعذر الاتصال بالخادم. تحقق من الاتصال ثم أعد المحاولة." : "The server could not be reached. Check your connection and try again.";
  return ar ? "تعذر إكمال التحليل الآن. حاول مرة أخرى بعد قليل." : "The analysis could not be completed right now. Please try again shortly.";
}

/** The failed-run text on the report and progress screens, where the cause is already stored and is never shown. */
export function analysisStoppedMessage(ar: boolean) {
  return ar ? "تعذر إكمال التحليل. أعد المحاولة أو راجع بيانات المشروع." : "The analysis could not be completed. Try again or review the project data.";
}

/** Why a copy could not be saved to the person's data: one calm sentence, never the server's own text. */
export function reportSaveMessage(error: unknown, ar: boolean) {
  const failure = error instanceof AnalysisRequestError ? error : undefined;
  if (failure?.status === 401) return ar ? "انتهت جلستك. سجّل الدخول ثم أعد المحاولة." : "Your session has ended. Sign in and try again.";
  if (failure?.status === 429) return ar ? "طلبات كثيرة خلال وقت قصير. انتظر دقيقة ثم أعد المحاولة." : "Too many requests in a short time. Wait a minute and try again.";
  if (failure?.status === 409) return ar ? "لا يمكن حفظ تقرير لم يكتمل تحليله بعد." : "A report whose analysis has not finished cannot be saved.";
  return ar ? "تعذر حفظ التقرير في بياناتك الآن. حاول مرة أخرى بعد قليل." : "The report could not be saved to your data right now. Please try again shortly.";
}
