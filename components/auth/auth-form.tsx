"use client";

import { useState, type FormEvent } from "react";
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
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
      {mode === "register" && (
        <>
          <Input
            label={labels.name}
            name="name"
            autoComplete="name"
            required
            disabled={loading}
            icon={<Icon name="user" />}
          />
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
        </>
      )}
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
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
        minLength={mode === "register" ? 12 : 1}
        maxLength={128}
        disabled={loading}
        icon={<Icon name="lock" />}
      />
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
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="auth-form__submit" disabled={loading}>
        {loading ? labels.loading : labels.submit}
        <Icon name="arrow" />
      </Button>
      <p className="form-note">
        <Icon name="shield" />
        {labels.note}
      </p>
    </form>
  );
}
