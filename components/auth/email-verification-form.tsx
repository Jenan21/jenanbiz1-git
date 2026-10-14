"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/types/i18n";

interface VerificationResponse {
  delivery?: "development" | "email" | "unavailable";
  developmentCode?: string;
  error?: string;
  resendAfterSeconds?: number;
  retryAfterSeconds?: number;
  verified?: boolean;
}

export function EmailVerificationForm({ email, locale, next, verified }: { email: string; locale: Locale; next: string; verified: boolean }) {
  const ar = locale === "ar";
  const router = useRouter();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/auth/verify-email", { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });
    return { ok: response.ok, payload: (await response.json().catch(() => null)) as VerificationResponse | null, status: response.status };
  }

  async function requestCode() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { ok, payload } = await post({ action: "request" });
      if (ok && payload?.verified) {
        router.replace(next);
        router.refresh();
      } else if (ok && payload?.delivery === "email") {
        setSent(true);
        setMessage(ar ? "أرسلنا رمزاً من ستة أرقام إلى بريدك. ينتهي خلال 15 دقيقة." : "We sent a six-digit code to your e-mail. It expires in 15 minutes.");
      } else if (ok && payload?.delivery === "development" && payload.developmentCode) {
        setSent(true);
        setDevelopmentCode(payload.developmentCode);
        setCode(payload.developmentCode);
        setMessage(ar ? "تم إنشاء رمز محلي للتطوير صالح لخمس عشرة دقيقة." : "A local development code was created and is valid for fifteen minutes.");
      } else if (ok) {
        setError(ar ? "إرسال البريد غير مهيأ بعد. تواصل مع مسؤول المنصة." : "E-mail delivery is not configured yet. Contact the platform administrator.");
      } else if (payload?.error === "TOO_SOON" || payload?.error === "TOO_MANY_CODES" || payload?.error === "RATE_LIMITED") {
        const wait = payload.retryAfterSeconds ? Math.ceil(payload.retryAfterSeconds / 60) : 1;
        setError(ar ? `طلبات كثيرة. حاول بعد ${wait} دقيقة تقريباً.` : `Too many requests. Try again in about ${wait} minute${wait === 1 ? "" : "s"}.`);
      } else {
        setError(ar ? "تعذر إرسال الرمز." : "The code could not be sent.");
      }
    } catch {
      setError(ar ? "تعذر الاتصال بالخدمة." : "Could not connect to the service.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { ok, payload } = await post({ action: "confirm", code });
      if (ok && payload?.verified) {
        router.replace(next);
        router.refresh();
        return;
      }
      setError(
        payload?.error === "RATE_LIMITED"
          ? ar ? "محاولات كثيرة. حاول لاحقاً." : "Too many attempts. Try again later."
          : payload?.error === "INVALID_OR_EXPIRED_CODE"
            ? ar ? "الرمز غير صحيح أو انتهت صلاحيته." : "The code is invalid or expired."
            : ar ? "تعذر التحقق." : "Verification failed.",
      );
    } catch {
      setError(ar ? "تعذر الاتصال بالخدمة." : "Could not connect to the service.");
    } finally {
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <div className="auth-workflow__form-stack">
        <p className="auth-hint" role="status">{ar ? "بريدك الإلكتروني موثّق." : "Your e-mail address is verified."}</p>
        <button className="button button--primary" type="button" onClick={() => router.replace(next)}>{ar ? "متابعة" : "Continue"}</button>
      </div>
    );
  }

  return (
    <div className="auth-workflow__form-stack">
      <form onSubmit={confirm}>
        <label>
          {ar ? "البريد الإلكتروني" : "Email address"}
          <input readOnly type="email" value={email} />
        </label>
        {sent ? (
          <label>
            {ar ? "رمز التحقق" : "Verification code"}
            <input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
        ) : null}
        {developmentCode ? (
          <p className="auth-workflow__dev-code">{ar ? "رمز التطوير" : "Development code"}: <output>{developmentCode}</output></p>
        ) : null}
        <div className="auth-workflow__actions">
          <button className="button button--ghost" type="button" disabled={busy} onClick={() => void requestCode()}>
            {sent ? (ar ? "إعادة إرسال الرمز" : "Send a new code") : ar ? "إرسال رمز التحقق" : "Send verification code"}
          </button>
          {sent ? (
            <button className="button button--primary" type="submit" disabled={busy}>
              {busy ? (ar ? "جارٍ التحقق..." : "Verifying...") : ar ? "تأكيد البريد" : "Verify e-mail"}
            </button>
          ) : null}
        </div>
      </form>
      {message ? <p className="auth-hint" role="status">{message}</p> : null}
      {error ? <p className="auth-hint" data-state="error" role="alert">{error}</p> : null}
    </div>
  );
}
