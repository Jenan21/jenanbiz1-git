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
  /** Which providers the server has credentials for. A provider without them is not shown at all. */
  availability: Record<OAuthProviderId, boolean>;
}

const icons = { google: GoogleIcon, apple: AppleIcon } as const;

/** True when at least one social sign-in provider can actually be used. */
export function hasSocialProviders(availability: Record<OAuthProviderId, boolean>) {
  return OAUTH_PROVIDERS.some((provider) => availability[provider]);
}

export function SocialAuth({ locale, entry, availability }: SocialAuthProps) {
  const ar = locale === "ar";
  const next = useSearchParams().get("next");
  const providers = OAUTH_PROVIDERS.filter((provider) => availability[provider]);
  if (!providers.length) return null;

  return (
    <div
      className="auth-social"
      data-count={providers.length}
      role="group"
      aria-label={ar ? "طرق دخول أخرى" : "Other sign-in methods"}
    >
      {providers.map((provider) => {
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
