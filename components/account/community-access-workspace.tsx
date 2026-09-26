"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Platform = "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "YOUTUBE" | "SNAPCHAT" | "X";
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

export function CommunityAccessWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [payload, setPayload] = useState<AccessPayload | null>(null);
  const [acknowledged, setAcknowledged] = useState<Partial<Record<Platform, boolean>>>({});
  const [busy, setBusy] = useState<Platform | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/community-access", { cache: "no-store" });
    const data = await response.json().catch(() => null) as AccessPayload | null;
    if (response.ok && data) setPayload(data);
    else setMessage(ar ? "تعذر تحميل قنوات المجتمع." : "Community channels could not be loaded.");
  }

  const loadOnMount = useEffectEvent(() => { void load(); });
  useEffect(() => { const timeout = window.setTimeout(loadOnMount, 0); return () => window.clearTimeout(timeout); }, []);

  async function grant(platform: Platform) {
    setBusy(platform); setMessage("");
    const response = await fetch("/api/community-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "grant", platform, acknowledged: true }) });
    const data = await response.json().catch(() => null) as (AccessPayload & { message?: string }) | null;
    if (response.ok && data) { setPayload(data); setMessage(ar ? "تم حفظ إقرار المتابعة وفتح الخدمة المحددة." : "Your acknowledgement was saved and the assigned service is available."); }
    else setMessage(data?.message ?? (ar ? "تعذر تحديث الوصول." : "Access could not be updated."));
    setBusy(null);
  }

  const granted = new Set(payload?.grants.map((item) => item.platform) ?? []);
  return (
    <section className="community-access" aria-busy={!payload || busy !== null}>
      {message ? <p className="user-center-message" role="status">{message}</p> : null}
      <div className="community-access__grid">
        {payload?.platforms.map((platform) => {
          const active = granted.has(platform.key);
          return <article key={platform.key}>
            <header><strong>{platform.key === "X" ? "X" : platform.key.charAt(0) + platform.key.slice(1).toLowerCase()}</strong><span className={active ? "is-active" : ""}>{active ? (ar ? "مفتوح" : "Unlocked") : (ar ? "غير مفتوح" : "Locked")}</span></header>
            <p>{ar ? "افتح الحساب الرسمي طوعياً، ثم أكد المتابعة يدوياً. لا ندّعي تحققاً آلياً غير متاح." : "Open the official account voluntarily, then acknowledge manually. We do not claim unavailable automatic verification."}</p>
            {platform.url ? <a className="button button--secondary" href={platform.url} rel="noreferrer" target="_blank">{ar ? "فتح الحساب الرسمي" : "Open official account"}</a> : <button className="button button--secondary" disabled type="button">{ar ? "بانتظار رابط معتمد" : "Awaiting approved link"}</button>}
            {active ? <Link className="button button--primary" href={destinations[platform.key]}>{ar ? "فتح الخدمة" : "Open service"}</Link> : <label><input disabled={!platform.url} type="checkbox" checked={acknowledged[platform.key] ?? false} onChange={(event) => setAcknowledged({ ...acknowledged, [platform.key]: event.target.checked })} /><span>{ar ? "أؤكد أنني تابعت الحساب طوعياً" : "I confirm I followed voluntarily"}</span></label>}
            {!active ? <button className="button button--primary" disabled={!platform.url || !acknowledged[platform.key] || busy !== null} onClick={() => void grant(platform.key)} type="button">{busy === platform.key ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "تحقق وافتح" : "Acknowledge and unlock")}</button> : null}
          </article>;
        })}
        {payload && !payload.platforms.length ? <p className="user-center-empty">{ar ? "لا توجد قنوات مجتمع مهيأة حالياً." : "No community channels are currently configured."}</p> : null}
      </div>
    </section>
  );
}