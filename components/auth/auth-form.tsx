"use client";

import { useState, type FormEvent, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/types/i18n";

interface AuthFormProps {
  mode: "login" | "register";
  locale: Locale;
  labels: {
    name: string;
    email: string;
    password: string;
    countryCode: string;
    submit: string;
    loading: string;
    remember: string;
    forgot: string;
    note: string;
    errors: Record<string, string>;
  };
}

export function AuthForm({ mode, locale, labels }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationStep, setRegistrationStep] = useState<1 | 2>(1);

  function validateRegistrationIdentity(form: HTMLFormElement) {
    for (const name of ["name", "email"] as const) {
      const control = form.elements.namedItem(name);
      if (control instanceof HTMLInputElement && !control.reportValidity()) {
        return false;
      }
    }
    return true;
  }

  function continueRegistration(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (form && validateRegistrationIdentity(form)) {
      setError(null);
      setRegistrationStep(2);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    if (mode === "register" && registrationStep === 1) {
      if (validateRegistrationIdentity(event.currentTarget)) {
        setRegistrationStep(2);
      }
      return;
    }
    if (mode === "register") {
      if (form.get("password") !== form.get("confirmPassword")) {
        setError(
          locale === "ar"
            ? "كلمتا المرور غير متطابقتين."
            : "Passwords do not match.",
        );
        return;
      }
      if (form.get("terms") !== "on") {
        setError(
          locale === "ar"
            ? "يجب الموافقة على الشروط والأحكام."
            : "You must accept the terms and conditions.",
        );
        return;
      }
    }
    setLoading(true);
    const payload =
      mode === "register"
        ? {
            displayName: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
            countryCode: form.get("countryCode"),
            locale,
            language: locale,
          }
        : {
            email: form.get("email"),
            password: form.get("password"),
            remember: form.get("remember") === "on",
          };
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(
          labels.errors[body.error ?? "UNKNOWN"] ?? labels.errors.UNKNOWN,
        );
        setLoading(false);
        return;
      }
      const requested = searchParams.get("next");
      const destination =
        mode === "login" &&
        (requested === "/admin" || requested === "/dashboard")
          ? requested
          : "/dashboard";
      router.replace(destination);
      router.refresh();
    } catch {
      setError(labels.errors.NETWORK);
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} aria-busy={loading}>
      {mode === "register" ? (
        <>
          <div className="auth-form__progress" aria-label={locale === "ar" ? "خطوات إنشاء الحساب" : "Account creation steps"}>
            <span data-active={registrationStep === 1 || undefined}>1</span>
            <i />
            <span data-active={registrationStep === 2 || undefined}>2</span>
          </div>
          <div className="auth-form__step" hidden={registrationStep !== 1}>
            <Input
              label={labels.name}
              name="name"
              autoComplete="name"
              required
              disabled={loading}
              icon={<Icon name="user" />}
            />
            <Input
              label={labels.email}
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={loading}
              icon={<Icon name="mail" />}
            />
            <Button type="button" className="auth-form__submit" onClick={continueRegistration}>
              {locale === "ar" ? "متابعة" : "Continue"}
              <Icon name="arrow" />
            </Button>
          </div>
          <div className="auth-form__step" hidden={registrationStep !== 2}>
            <Input
              label={labels.countryCode}
              name="countryCode"
              autoComplete="country"
              required
              minLength={2}
              maxLength={2}
              placeholder="SA"
              disabled={loading}
              icon={<Icon name="globe" />}
            />
            <Input
              label={labels.password}
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              disabled={loading}
              icon={<Icon name="lock" />}
            />
            <Input
              label={locale === "ar" ? "تأكيد كلمة المرور" : "Confirm password"}
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              disabled={loading}
              icon={<Icon name="lock" />}
            />
            <label className="checkbox auth-form__terms">
              <input name="terms" type="checkbox" required disabled={loading} />
              <span>{locale === "ar" ? "أوافق على الشروط والأحكام" : "I accept the terms and conditions"}</span>
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <div className="auth-form__step-actions">
              <button type="button" className="text-button" onClick={() => setRegistrationStep(1)} disabled={loading}>
                {locale === "ar" ? "السابق" : "Back"}
              </button>
              <Button type="submit" className="auth-form__submit" disabled={loading}>
                {loading ? labels.loading : labels.submit}
                <Icon name="arrow" />
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <Input
            label={labels.email}
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={loading}
            icon={<Icon name="mail" />}
          />
          <Input
            label={labels.password}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={1}
            maxLength={128}
            disabled={loading}
            icon={<Icon name="lock" />}
          />
        </>
      )}
      {mode === "login" && (
        <div className="auth-form__options">
          <label className="checkbox">
            <input name="remember" type="checkbox" disabled={loading} />
            <span>{labels.remember}</span>
          </label>
          <button type="button" className="text-button" disabled>
            {labels.forgot}
          </button>
        </div>
      )}
      {mode === "login" && error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {mode === "login" && (
        <>
          <Button type="submit" className="auth-form__submit" disabled={loading}>
            {loading ? labels.loading : labels.submit}
            <Icon name="arrow" />
          </Button>
          <p className="form-note">
            <Icon name="shield" />
            {labels.note}
          </p>
        </>
      )}
    </form>
  );
}
