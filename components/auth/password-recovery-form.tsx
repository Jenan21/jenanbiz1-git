"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/types/i18n";

interface RecoveryResponse {
  delivery?: "development" | "email" | "unavailable";
  developmentCode?: string;
  error?: string;
}

export function PasswordRecoveryForm({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [phase, setPhase] = useState<"request" | "confirm">("request");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request", email }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as RecoveryResponse | null;
      if (
        response.ok &&
        payload?.delivery === "development" &&
        payload.developmentCode
      ) {
        setDevelopmentCode(payload.developmentCode);
        setCode(payload.developmentCode);
        setPhase("confirm");
        setMessage(
          ar
            ? "تم إنشاء رمز تحقق محلي صالح لعشر دقائق."
            : "A local verification code was created and is valid for ten minutes.",
        );
      } else if (response.ok && payload?.delivery === "email") {
        setDevelopmentCode(null);
        setCode("");
        setPhase("confirm");
        setMessage(
          ar
            ? "إذا كان الحساب مؤهلاً، أرسلنا رمزاً صالحاً لعشر دقائق إلى البريد المسجل."
            : "If the account is eligible, a ten-minute verification code was sent to the registered email.",
        );
      } else if (response.ok) {
        setMessage(
          ar
            ? "خدمة إرسال رموز الاستعادة غير مهيأة حالياً. تواصل مع مسؤول المنصة."
            : "Password recovery delivery is not configured. Contact the platform administrator.",
        );
      } else {
        setError(
          payload?.error === "RATE_LIMITED"
            ? ar
              ? "محاولات كثيرة. حاول لاحقاً."
              : "Too many attempts. Try again later."
            : ar
              ? "تعذر بدء الاستعادة."
              : "Recovery could not be started.",
        );
      }
    } catch {
      setError(
        ar
          ? "تعذر الاتصال بخدمة الاستعادة."
          : "Could not connect to the recovery service.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError(ar ? "كلمتا المرور غير متطابقتين." : "Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirm", code, email, password }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as RecoveryResponse | null;
      if (response.ok) {
        router.replace("/auth/login?reset=success");
        router.refresh();
        return;
      }
      setError(
        payload?.error === "RATE_LIMITED"
          ? ar
            ? "محاولات كثيرة. حاول لاحقاً."
            : "Too many attempts. Try again later."
          : payload?.error === "INVALID_OR_EXPIRED_CODE"
            ? ar
              ? "الرمز غير صحيح أو انتهت صلاحيته."
              : "The code is invalid or expired."
            : ar
              ? "تعذر تغيير كلمة المرور."
              : "Password could not be changed.",
      );
    } catch {
      setError(
        ar
          ? "تعذر الاتصال بخدمة الاستعادة."
          : "Could not connect to the recovery service.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-workflow__form-stack">
      {phase === "request" ? (
        <form onSubmit={requestCode}>
          <label>
            {ar ? "البريد الإلكتروني" : "Email address"}
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button
            className="button button--primary"
            disabled={busy}
            type="submit"
          >
            {busy
              ? ar
                ? "جارٍ التحقق..."
                : "Checking..."
              : ar
                ? "إرسال رمز التحقق"
                : "Send verification code"}
          </button>
        </form>
      ) : (
        <form onSubmit={confirmReset}>
          <label>
            {ar ? "البريد الإلكتروني" : "Email address"}
            <input readOnly type="email" value={email} />
          </label>
          <label>
            {ar ? "رمز التحقق" : "Verification code"}
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <label>
            {ar ? "كلمة المرور الجديدة" : "New password"}
            <input
              required
              minLength={12}
              maxLength={128}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label>
            {ar ? "تأكيد كلمة المرور" : "Confirm password"}
            <input
              required
              minLength={12}
              maxLength={128}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          <div className="auth-workflow__actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={() => setPhase("request")}
            >
              {ar ? "السابق" : "Back"}
            </button>
            <button
              className="button button--primary"
              disabled={busy}
              type="submit"
            >
              {busy
                ? ar
                  ? "جارٍ الحفظ..."
                  : "Saving..."
                : ar
                  ? "تأكيد كلمة المرور"
                  : "Confirm password"}
            </button>
          </div>
        </form>
      )}
      {developmentCode ? (
        <p className="auth-workflow__dev-code">
          <span>
            {ar ? "رمز بيئة التطوير" : "Development verification code"}
          </span>
          <output>{developmentCode}</output>
        </p>
      ) : null}
      {message ? (
        <p role="status" className="auth-workflow__message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="auth-workflow__error">
          {error}
        </p>
      ) : null}
      <Link className="auth-workflow__return" href="/auth/login">
        {ar ? "العودة إلى تسجيل الدخول" : "Return to sign in"}
      </Link>
    </div>
  );
}
