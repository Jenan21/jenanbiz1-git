"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import countries from "world-countries";
import {
  AuthAlertIcon,
  AuthCheckIcon,
  AuthChevronIcon,
  AuthEyeIcon,
  AuthEyeOffIcon,
  AuthGlobeIcon,
  AuthInfoIcon,
  AuthLockIcon,
  AuthLoginIcon,
  AuthMailIcon,
  AuthPhoneIcon,
  AuthUserIcon,
  AuthUserPlusIcon,
} from "@/components/auth/auth-icons";
import { oauthNotice } from "@/lib/auth/oauth/shared";
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

function dialCodeOf(idd: { root: string; suffixes: string[] }) {
  if (!idd.root) return "";
  return idd.suffixes.length === 1 ? `${idd.root}${idd.suffixes[0]}` : idd.root;
}

const countryOptions = countries
  .filter((country) => country.cca2)
  .map((country) => ({
    ar: country.translations.ara?.common ?? country.name.common,
    code: country.cca2.toUpperCase(),
    dial: dialCodeOf(country.idd),
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

/** Builds the E.164 number the API expects from what the user typed. */
function toE164(raw: string, dial: string) {
  const compact = raw.replace(/[\s().-]/g, "");
  if (!compact) return undefined;
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  return `${dial}${compact.replace(/^0+/, "")}`;
}

function PasswordField({
  autoComplete,
  disabled,
  icon,
  label,
  name,
  placeholder,
  showLabel,
  hideLabel,
  slot,
  minLength,
}: {
  autoComplete: string;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  name: string;
  placeholder: string;
  showLabel: string;
  hideLabel: string;
  slot: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-field" data-slot={slot}>
      <span className="auth-field__icon">{icon}</span>
      <input
        aria-label={label}
        autoComplete={autoComplete}
        className="auth-field__input"
        disabled={disabled}
        id={`auth-${name}`}
        maxLength={128}
        minLength={minLength}
        name={name}
        placeholder={placeholder}
        required
        type={visible ? "text" : "password"}
      />
      <button
        type="button"
        className="auth-field__toggle"
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <AuthEyeOffIcon /> : <AuthEyeIcon />}
      </button>
    </div>
  );
}

function CheckBox({
  children,
  disabled,
  label,
  name,
  required,
}: {
  children: ReactNode;
  disabled: boolean;
  label?: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="auth-check">
      <input
        aria-label={label}
        disabled={disabled}
        name={name}
        required={required}
        type="checkbox"
      />
      <span className="auth-check__box">
        <AuthCheckIcon />
      </span>
      <span className="auth-check__text">{children}</span>
    </label>
  );
}

export function AuthForm({ mode, locale, labels }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [countryCode, setCountryCode] = useState(locale === "ar" ? "SA" : "US");
  const changedByUser = useRef(false);
  const ar = locale === "ar";
  const registering = mode === "register";
  const resetSucceeded =
    mode === "login" && searchParams.get("reset") === "success";
  // a failed Google / Apple attempt comes back here with a short error code
  const socialNotice = oauthNotice(
    locale,
    searchParams.get("oauth_error"),
    searchParams.get("oauth_provider"),
  );
  const selectedCountry = countriesByLocale[locale].find(
    (country) => country.code === countryCode,
  );
  const dial = selectedCountry?.dial || "+966";
  const copy = ar
    ? {
        identifier: "اسم المستخدم أو البريد الإلكتروني",
        confirm: "تأكيد كلمة المرور",
        phone: "رقم الجوال",
        phoneTag: "رمز الدولة / رقم الجوال",
        terms: "الشروط والأحكام",
        agree: "أوافق على",
        termsBody:
          "أتعهد باستخدام بيانات صحيحة، وحماية بيانات الدخول، وعدم إساءة استخدام خدمات المنصة أو بيانات الآخرين.",
        show: "إظهار كلمة المرور",
        hide: "إخفاء كلمة المرور",
        mismatch: "كلمتا المرور غير متطابقتين.",
        acceptTerms: "يجب الموافقة على الشروط والأحكام.",
        badPhone: "رقم الجوال غير صالح. مثال: +966 50 123 4567",
        emailOnly: "تسجيل الدخول متاح حاليًا بالبريد الإلكتروني فقط.",
        resetDone: "تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.",
      }
    : {
        identifier: "Username or email",
        confirm: "Confirm password",
        phone: "Mobile number",
        phoneTag: "Country code / mobile number",
        terms: "terms and conditions",
        agree: "I agree to the",
        termsBody:
          "I agree to provide accurate information, protect my access credentials, and avoid misuse of platform services or other users' data.",
        show: "Show password",
        hide: "Hide password",
        mismatch: "Passwords do not match.",
        acceptTerms: "You must accept the terms and conditions.",
        badPhone: "Invalid mobile number. Example: +966 50 123 4567",
        emailOnly: "Sign-in currently works with your email address only.",
        resetDone: "Your password was updated. You can sign in now.",
      };

  useEffect(() => {
    if (!registering) return;
    const controller = new AbortController();
    async function detectCountry() {
      try {
        const response = await fetch("/api/auth/country", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as { countryCode?: string };
        if (
          response.ok &&
          payload.countryCode &&
          countriesByLocale.en.some(
            (country) => country.code === payload.countryCode,
          ) &&
          !changedByUser.current
        ) {
          setCountryCode(payload.countryCode);
        }
      } catch {
        // Keep the default country when detection is unavailable.
      }
    }
    void detectCountry();
    return () => controller.abort();
  }, [registering]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const phone = registering
      ? toE164(String(form.get("phone") ?? ""), dial)
      : undefined;
    if (registering) {
      if (form.get("password") !== form.get("confirmPassword")) {
        setError(copy.mismatch);
        return;
      }
      if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) {
        setError(copy.badPhone);
        return;
      }
      if (form.get("terms") !== "on") {
        setError(copy.acceptTerms);
        return;
      }
    } else if (!String(form.get("email") ?? "").includes("@")) {
      setError(labels.errors.EMAIL_ONLY ?? copy.emailOnly);
      return;
    }
    setLoading(true);
    const payload = registering
      ? {
          displayName: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          countryCode: form.get("countryCode"),
          ...(phone ? { phone } : {}),
          locale,
          language: locale,
        }
      : {
          email: String(form.get("email") ?? "").trim(),
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
      const destination = registering
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

  const primaryLabel = loading ? labels.loading : labels.submit;

  if (!registering) {
    return (
      <form
        id="auth-login-form"
        className="auth-form"
        onSubmit={handleSubmit}
        aria-busy={loading}
      >
        <label
          className="auth-label"
          data-slot="user"
          htmlFor="auth-login-identifier"
        >
          {copy.identifier}
        </label>
        <div className="auth-field" data-slot="user">
          <span className="auth-field__icon">
            <AuthUserIcon />
          </span>
          <input
            autoComplete="username"
            className="auth-field__input"
            disabled={loading}
            id="auth-login-identifier"
            inputMode="email"
            name="email"
            placeholder={copy.identifier}
            required
            spellCheck={false}
            type="text"
          />
        </div>
        <label className="auth-label" data-slot="password" htmlFor="auth-password">
          {labels.password}
        </label>
        <PasswordField
          autoComplete="current-password"
          disabled={loading}
          hideLabel={copy.hide}
          icon={<AuthLockIcon />}
          label={labels.password}
          name="password"
          placeholder={labels.password}
          showLabel={copy.show}
          slot="password"
        />
        <div className="auth-options">
          <CheckBox disabled={loading} name="remember">
            {labels.remember}
          </CheckBox>
          <Link href="/auth/forgot" className="auth-options__forgot">
            {labels.forgot}
          </Link>
        </div>
        {error ? (
          <p className="auth-status" data-state="error" role="alert">
            <AuthAlertIcon />
            {error}
          </p>
        ) : socialNotice ? (
          <p className="auth-status" data-state="error" role="alert">
            <AuthAlertIcon />
            {socialNotice}
          </p>
        ) : resetSucceeded ? (
          <p className="auth-status" data-state="success" role="status">
            <AuthCheckIcon />
            {copy.resetDone}
          </p>
        ) : null}
        <button
          type="submit"
          className="auth-primary"
          disabled={loading}
        >
          <AuthLoginIcon />
          <span>{primaryLabel}</span>
        </button>
      </form>
    );
  }

  return (
    <form
      id="auth-register-form"
      className="auth-form"
      onSubmit={handleSubmit}
      aria-busy={loading}
    >
      <div className="auth-field" data-slot="name">
        <span className="auth-field__icon">
          <AuthUserIcon />
        </span>
        <input
          aria-label={labels.name}
          autoComplete="name"
          className="auth-field__input"
          disabled={loading}
          id="auth-name"
          name="name"
          placeholder={labels.name}
          required
          type="text"
        />
      </div>
      <div className="auth-field" data-slot="email">
        <span className="auth-field__icon">
          <AuthMailIcon />
        </span>
        <input
          aria-label={labels.email}
          autoComplete="email"
          className="auth-field__input"
          disabled={loading}
          id="auth-email"
          name="email"
          placeholder={labels.email}
          required
          spellCheck={false}
          type="email"
        />
      </div>
      <div className="auth-field auth-field--phone" data-slot="phone">
        <span className="auth-field__icon">
          <AuthPhoneIcon />
        </span>
        <span className="auth-country">
          <AuthGlobeIcon />
          <b>{countryCode}</b>
          <AuthChevronIcon />
          <select
            aria-label={labels.countryCode}
            disabled={loading}
            name="countryCode"
            value={countryCode}
            onChange={(event) => {
              changedByUser.current = true;
              setCountryCode(event.target.value);
            }}
          >
            {countriesByLocale[locale].map((country) => (
              <option key={country.code} value={country.code}>
                {country[locale]} {country.dial ? `(${country.dial})` : ""}
              </option>
            ))}
          </select>
        </span>
        <input
          aria-label={copy.phone}
          autoComplete="tel"
          className="auth-field__input"
          dir="ltr"
          disabled={loading}
          id="auth-phone"
          inputMode="tel"
          name="phone"
          placeholder={`${dial} 50 123 4567`}
          type="tel"
        />
        <span className="auth-field__tag" aria-hidden="true">
          {copy.phoneTag}
        </span>
      </div>
      <PasswordField
        autoComplete="new-password"
        disabled={loading}
        hideLabel={copy.hide}
        icon={<AuthLockIcon />}
        label={labels.password}
        minLength={12}
        name="password"
        placeholder={labels.password}
        showLabel={copy.show}
        slot="password"
      />
      <PasswordField
        autoComplete="new-password"
        disabled={loading}
        hideLabel={copy.hide}
        icon={<AuthLockIcon />}
        label={copy.confirm}
        minLength={12}
        name="confirmPassword"
        placeholder={copy.confirm}
        showLabel={copy.show}
        slot="confirm"
      />
      {error ? (
        <p className="auth-hint" data-state="error" role="alert">
          <AuthAlertIcon />
          {error}
        </p>
      ) : socialNotice ? (
        <p className="auth-hint" data-state="error" role="alert">
          <AuthAlertIcon />
          {socialNotice}
        </p>
      ) : termsOpen ? (
        <p className="auth-hint" data-state="terms" id="auth-terms-body">
          {copy.termsBody}
        </p>
      ) : (
        <p className="auth-hint">
          <AuthInfoIcon />
          {labels.note}
        </p>
      )}
      <div className="auth-terms">
        <CheckBox
          disabled={loading}
          label={ar ? "أوافق على الشروط والأحكام" : "I accept the terms and conditions"}
          name="terms"
          required
        >
          {copy.agree}{" "}
          <button
            type="button"
            aria-controls="auth-terms-body"
            aria-expanded={termsOpen}
            className="auth-terms__link"
            onClick={(event) => {
              event.preventDefault();
              setTermsOpen((open) => !open);
            }}
          >
            {copy.terms}
          </button>
        </CheckBox>
      </div>
      <button type="submit" className="auth-primary" disabled={loading}>
        <AuthUserPlusIcon />
        <span>{primaryLabel}</span>
      </button>
    </form>
  );
}
