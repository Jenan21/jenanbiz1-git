"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import countries from "world-countries";
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

const countryOptions = countries
  .filter((country) => country.cca2)
  .map((country) => ({
    ar: country.translations.ara?.common ?? country.name.common,
    code: country.cca2.toUpperCase(),
    en: country.name.common,
  }));

const countriesByLocale = {
  ar: [...countryOptions].sort((left, right) =>
    left.ar.localeCompare(right.ar, "ar"),
  ),
  en: [...countryOptions].sort((left, right) =>
    left.en.localeCompare(right.en, "en"),
  ),
};

function countryFlag(countryCode: string) {
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split("")
      .map((character) => 127397 + character.charCodeAt(0)),
  );
}

function CountrySelector({
  disabled,
  label,
  locale,
}: {
  disabled: boolean;
  label: string;
  locale: Locale;
}) {
  const changedByUser = useRef(false);
  const [countryCode, setCountryCode] = useState(locale === "ar" ? "SA" : "US");
  const [source, setSource] = useState<"default" | "manual" | "network">(
    "default",
  );
  const selectedCountry = countriesByLocale[locale].find(
    (country) => country.code === countryCode,
  );

  useEffect(() => {
    const controller = new AbortController();
    async function detectCountry() {
      try {
        const response = await fetch("/api/auth/country", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          countryCode?: string;
          source?: "default" | "network";
        };
        if (
          response.ok &&
          payload.countryCode &&
          countriesByLocale.en.some(
            (country) => country.code === payload.countryCode,
          ) &&
          !changedByUser.current
        ) {
          setCountryCode(payload.countryCode);
          setSource(payload.source === "network" ? "network" : "default");
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSource("default");
        }
      }
    }
    void detectCountry();
    return () => controller.abort();
  }, []);

  return (
    <div className="field auth-country">
      <label className="field__label" htmlFor="auth-country-code">
        {label}
      </label>
      <div className="auth-country__control">
        <span className="auth-country__selector">
          <Icon name="chevron" />
          <span className="auth-country__selected" aria-hidden="true">
            <strong>{selectedCountry?.[locale]}</strong>
            <small>
              {locale === "ar" ? "يمكنك تغيير الدولة" : "You can change country"}
            </small>
          </span>
          <span className="auth-country__flag" aria-hidden="true">
            {countryFlag(countryCode)}
          </span>
          <select
            id="auth-country-code"
            aria-label={label}
            disabled={disabled}
            name="countryCode"
            value={countryCode}
            onChange={(event) => {
              changedByUser.current = true;
              setCountryCode(event.target.value);
              setSource("manual");
            }}
          >
            {countriesByLocale[locale].map((country) => (
              <option key={country.code} value={country.code}>
                {countryFlag(country.code)} {country[locale]}
              </option>
            ))}
          </select>
        </span>
        <span className="auth-country__source" aria-live="polite">
          <i data-source={source} />
          {source === "network"
            ? locale === "ar"
              ? "تم التعرف عبر عنوان IP"
              : "Detected from your IP"
            : source === "manual"
              ? locale === "ar"
                ? "اختيارك اليدوي"
                : "Your manual choice"
              : locale === "ar"
                ? "يمكنك تغيير الدولة"
                : "You can change the country"}
        </span>
      </div>
    </div>
  );
}

export function AuthForm({ mode, locale, labels }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resetSucceeded =
    mode === "login" && searchParams.get("reset") === "success";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
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
        mode === "register"
          ? "/user/onboarding"
          : requested?.startsWith("/") && !requested.startsWith("//")
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
    <form
      id={`auth-${mode}-form`}
      className="auth-form"
      onSubmit={handleSubmit}
      aria-busy={loading}
    >
      {mode === "register" ? (
        <div className="auth-form__step auth-form__step--all">
          <Input
            label={labels.name}
            name="name"
            autoComplete="name"
            placeholder={labels.name}
            required
            disabled={loading}
            icon={<Icon name="user" />}
          />
          <Input
            label={labels.email}
            name="email"
            type="email"
            autoComplete="email"
            placeholder={labels.email}
            required
            disabled={loading}
            icon={<Icon name="mail" />}
          />
          <CountrySelector
            disabled={loading}
            label={labels.countryCode}
            locale={locale}
          />
          <Input
            label={labels.password}
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder={labels.password}
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
            placeholder={
              locale === "ar" ? "تأكيد كلمة المرور" : "Confirm password"
            }
            required
            minLength={12}
            maxLength={128}
            disabled={loading}
            icon={<Icon name="lock" />}
          />
          <div className="auth-form__terms-field">
            <label className="checkbox auth-form__terms">
              <input
                name="terms"
                type="checkbox"
                required
                disabled={loading}
                aria-label={
                  locale === "ar"
                    ? "أوافق على الشروط والأحكام"
                    : "I accept the terms and conditions"
                }
              />
              <span>
                {locale === "ar"
                  ? "أوافق على الشروط والأحكام"
                  : "I agree to the terms and conditions"}
              </span>
            </label>
            <details className="auth-form__terms-details">
              <summary>
                {locale === "ar" ? "عرض شروط الاستخدام" : "View terms of use"}
              </summary>
              <p>
                {locale === "ar"
                  ? "أتعهد باستخدام بيانات صحيحة، وحماية بيانات الدخول، وعدم إساءة استخدام خدمات المنصة أو بيانات الآخرين."
                  : "I agree to provide accurate information, protect my access credentials, and avoid misuse of platform services or other users' data."}
              </p>
            </details>
          </div>
          <p className="form-note">
            <Icon name="shield" />
            {labels.note}
          </p>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="auth-form__submit"
            disabled={loading}
          >
            {loading ? labels.loading : labels.submit}
            <Icon name="arrow" />
          </Button>
        </div>
      ) : (
        <>
          {resetSucceeded ? (
            <p className="auth-success" role="status">
              <Icon name="check" />
              {locale === "ar"
                ? "تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن."
                : "Your password was updated. You can sign in now."}
            </p>
          ) : null}
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
          <Link href="/auth/forgot" className="text-button">
            {labels.forgot}
          </Link>
        </div>
      )}
      {mode === "login" && error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {mode === "login" && (
        <>
          <Button
            type="submit"
            className="auth-form__submit"
            disabled={loading}
          >
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
