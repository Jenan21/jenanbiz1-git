"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Platform =
  "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "YOUTUBE" | "SNAPCHAT" | "X";
type AccessPayload = {
  platforms: Array<{ key: Platform; url: string | null }>;
  grants: Array<{ platform: Platform; grantedAt: string }>;
  hasAccess: boolean;
};

const destinations: Record<Platform, string> = {
  FACEBOOK: "/talent",
  INSTAGRAM: "/studio",
  TIKTOK: "/software",
  YOUTUBE: "/academy",
  SNAPCHAT: "/market",
  X: "/projects/analysis",
};

const platformMeta: Record<
  Platform,
  { icon: IconName; label: string; service: { ar: string; en: string } }
> = {
  FACEBOOK: {
    icon: "people",
    label: "Facebook",
    service: { ar: "مساحة المواهب", en: "Talent workspace" },
  },
  INSTAGRAM: {
    icon: "sparkles",
    label: "Instagram",
    service: { ar: "استوديو جنان", en: "Jenan Studio" },
  },
  TIKTOK: {
    icon: "activity",
    label: "TikTok",
    service: { ar: "برمجيات جنان", en: "Jenan Software" },
  },
  YOUTUBE: {
    icon: "graduation",
    label: "YouTube",
    service: { ar: "أكاديمية جنان", en: "Jenan Academy" },
  },
  SNAPCHAT: {
    icon: "eye",
    label: "Snapchat",
    service: { ar: "سوق جنان", en: "Jenan Market" },
  },
  X: {
    icon: "trend",
    label: "X",
    service: { ar: "تحليل المشاريع", en: "Project analysis" },
  },
};

export function CommunityAccessWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [payload, setPayload] = useState<AccessPayload | null>(null);
  const [acknowledged, setAcknowledged] = useState<
    Partial<Record<Platform, boolean>>
  >({});
  const [busy, setBusy] = useState<Platform | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/community-access", {
      cache: "no-store",
    });
    const data = (await response
      .json()
      .catch(() => null)) as AccessPayload | null;
    if (response.ok && data) setPayload(data);
    else
      setMessage(
        ar
          ? "تعذر تحميل قنوات المجتمع."
          : "Community channels could not be loaded.",
      );
  }

  const loadOnMount = useEffectEvent(() => {
    void load();
  });
  useEffect(() => {
    const timeout = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function grant(platform: Platform) {
    setBusy(platform);
    setMessage("");
    const response = await fetch("/api/community-access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "grant", platform, acknowledged: true }),
    });
    const data = (await response.json().catch(() => null)) as
      (AccessPayload & { message?: string }) | null;
    if (response.ok && data) {
      setPayload(data);
      setMessage(
        ar
          ? "تم حفظ إقرار المتابعة وفتح الخدمة المحددة."
          : "Your acknowledgement was saved and the assigned service is available.",
      );
    } else
      setMessage(
        data?.message ??
          (ar ? "تعذر تحديث الوصول." : "Access could not be updated."),
      );
    setBusy(null);
  }

  const granted = new Set(payload?.grants.map((item) => item.platform) ?? []);
  return (
    <section className="community-access" aria-busy={!payload || busy !== null}>
      {message ? (
        <p className="user-center-message" role="status">
          {message}
        </p>
      ) : null}
      <div className="community-access__summary">
        <article>
          <span className="user-investments__metric-icon">
            <Icon name="globe" />
          </span>
          <div>
            <strong>{payload ? payload.platforms.length : "—"}</strong>
            <small>{ar ? "قنوات معتمدة" : "Approved channels"}</small>
          </div>
        </article>
        <article>
          <span className="user-investments__metric-icon">
            <Icon name="check" />
          </span>
          <div>
            <strong>{payload ? payload.grants.length : "—"}</strong>
            <small>{ar ? "خدمات مفتوحة" : "Unlocked services"}</small>
          </div>
        </article>
        <article>
          <span className="user-investments__metric-icon">
            <Icon name="shield" />
          </span>
          <div>
            <strong>{ar ? "يدوي" : "Manual"}</strong>
            <small>{ar ? "سياسة التحقق" : "Verification policy"}</small>
          </div>
        </article>
      </div>
      <div className="community-access__grid">
        {!payload ? (
          <div className="community-access__loading" role="status">
            <Icon name="activity" />
            <strong>
              {ar ? "جارٍ تحميل القنوات المعتمدة" : "Loading approved channels"}
            </strong>
            <span>
              {ar
                ? "يتم التحقق من الإعدادات الحالية."
                : "Checking the current configuration."}
            </span>
          </div>
        ) : null}
        {payload?.platforms.map((platform) => {
          const active = granted.has(platform.key);
          const meta = platformMeta[platform.key];
          return (
            <article key={platform.key}>
              <header>
                <div>
                  <span className="community-access__platform-icon">
                    <Icon name={meta.icon} />
                  </span>
                  <span>
                    <strong>{meta.label}</strong>
                    <small>{meta.service[locale]}</small>
                  </span>
                </div>
                <span className={active ? "is-active" : ""}>
                  {active
                    ? ar
                      ? "مفتوح"
                      : "Unlocked"
                    : ar
                      ? "غير مفتوح"
                      : "Locked"}
                </span>
              </header>
              <p>
                {ar
                  ? "افتح الحساب الرسمي طوعياً، ثم أكد المتابعة يدوياً. لا ندّعي تحققاً آلياً غير متاح."
                  : "Open the official account voluntarily, then acknowledge manually. We do not claim unavailable automatic verification."}
              </p>
              {platform.url ? (
                <a
                  className="button button--secondary"
                  href={platform.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {ar ? "فتح الحساب الرسمي" : "Open official account"}
                </a>
              ) : (
                <button
                  className="button button--secondary"
                  disabled
                  type="button"
                >
                  {ar ? "بانتظار رابط معتمد" : "Awaiting approved link"}
                </button>
              )}
              {active ? (
                <Link
                  className="button button--primary"
                  href={destinations[platform.key]}
                >
                  {ar ? "فتح الخدمة" : "Open service"}
                </Link>
              ) : (
                <label>
                  <input
                    disabled={!platform.url}
                    type="checkbox"
                    checked={acknowledged[platform.key] ?? false}
                    onChange={(event) =>
                      setAcknowledged({
                        ...acknowledged,
                        [platform.key]: event.target.checked,
                      })
                    }
                  />
                  <span>
                    {ar
                      ? "أؤكد أنني تابعت الحساب طوعياً"
                      : "I confirm I followed voluntarily"}
                  </span>
                </label>
              )}
              {!active ? (
                <button
                  className="button button--primary"
                  disabled={
                    !platform.url ||
                    !acknowledged[platform.key] ||
                    busy !== null
                  }
                  onClick={() => void grant(platform.key)}
                  type="button"
                >
                  {busy === platform.key
                    ? ar
                      ? "جارٍ الحفظ..."
                      : "Saving..."
                    : ar
                      ? "تحقق وافتح"
                      : "Acknowledge and unlock"}
                </button>
              ) : null}
            </article>
          );
        })}
        {payload && !payload.platforms.length ? (
          <div className="community-access__loading user-center-empty">
            <Icon name="globe" />
            <strong>
              {ar
                ? "لا توجد قنوات مجتمع مهيأة حالياً"
                : "No community channels are configured"}
            </strong>
            <span>
              {ar
                ? "ستظهر القنوات هنا بعد اعتماد روابطها الرسمية."
                : "Channels appear here after their official links are approved."}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
