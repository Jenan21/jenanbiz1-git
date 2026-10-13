"use client";

import { useSearchParams } from "next/navigation";
import { AppleIcon, GoogleIcon } from "@/components/auth/auth-icons";
import {
  OAUTH_PROVIDER_LABEL,
  OAUTH_PROVIDERS,
  oauthStartPath,
  type OAuthEntryPoint,
  type OAuthProviderId,
} from "@/lib/auth/oauth/shared";

interface SocialAuthProps {
  locale: "ar" | "en";
  entry: OAuthEntryPoint;
  /** Which providers the server has credentials for; the others are shown as not yet available. */
  availability: Record<OAuthProviderId, boolean>;
}

const icons = { google: GoogleIcon, apple: AppleIcon } as const;

export function SocialAuth({ locale, entry, availability }: SocialAuthProps) {
  const ar = locale === "ar";
  const next = useSearchParams().get("next");

  return (
    <div
      className="auth-social"
      role="group"
      aria-label={ar ? "طرق دخول أخرى" : "Other sign-in methods"}
    >
      {OAUTH_PROVIDERS.map((provider) => {
        const label = OAUTH_PROVIDER_LABEL[provider];
        const Icon = icons[provider];
        const action =
          entry === "login"
            ? ar
              ? `الدخول عبر ${label}`
              : `Sign in with ${label}`
            : ar
              ? `التسجيل عبر ${label}`
              : `Sign up with ${label}`;

        if (!availability[provider]) {
          return (
            <button
              key={provider}
              type="button"
              className="auth-social__btn"
              data-provider={provider}
              disabled
              aria-label={`${action} (${ar ? "قريباً" : "coming soon"})`}
            >
              <Icon />
              <span>{label}</span>
              <small>{ar ? "قريباً" : "Soon"}</small>
            </button>
          );
        }
        return (
          <a
            key={provider}
            className="auth-social__btn"
            data-provider={provider}
            href={oauthStartPath(provider, { from: entry, next })}
            aria-label={action}
          >
            <Icon />
            <span>{label}</span>
          </a>
        );
      })}
    </div>
  );
}
