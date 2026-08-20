"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { ThemeToggle } from "@/components/source/source-controls";
import { Icon } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";

type GatewayState = "initial" | "login";

interface LoginGatewayProps {
  locale: Locale;
  languageLabel: string;
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

const marketItems = [
  ["الذهب", "Gold"],
  ["النفط الخام", "Crude oil"],
  ["BTC / USD", "BTC / USD"],
  ["مؤشر الدولار", "Dollar index"],
] as const;

interface AnalyticsGraphicProps {
  label: string;
  values?: readonly number[];
  comparison?: readonly number[];
  locale?: Locale;
}

interface LiveMarketInstrument {
  symbol: string;
  price: number;
  percentChange: number | null;
  series: number[];
  datetime: string | null;
}

interface LiveMarketPayload {
  state: "live" | "stale" | "disconnected" | "error";
  provider: string | null;
  updatedAt: string | null;
  staleAt: string | null;
  instruments: LiveMarketInstrument[];
}

const analyticsColors = ["#28d9dc", "#3b9fc9", "#dbc06b", "#62ce96", "#8c9da0"] as const;

function linePoints(values: readonly number[]) {
  if (!values.length) return "";
  const maximum = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = 30 + (177 * index) / Math.max(values.length - 1, 1);
      const y = 112 - (87 * value) / maximum;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function radarPoints(values: readonly number[]) {
  if (values.length < 3) return "";
  const maximum = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / values.length;
      const radius = 50 * (value / maximum);
      return `${(110 + Math.cos(angle) * radius).toFixed(1)},${(72 + Math.sin(angle) * radius).toFixed(1)}`;
    })
    .join(" ");
}

function RevenueGraphic({ label, values, locale = "ar" }: AnalyticsGraphicProps) {
  const radius = 44;
  const circumference = Math.PI * 2 * radius;
  const total = values?.reduce((sum, value) => sum + Math.max(value, 0), 0) ?? 0;
  let segmentOffset = 0;
  return (
    <svg className="login-gateway__analytics-svg" viewBox="0 0 220 145" role="img" aria-label={label}>
      <defs>
        <filter id="revenue-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g transform="translate(72 72) rotate(-90)" fill="none" strokeWidth="12">
        <circle r="44" stroke="rgba(123,166,178,.2)" />
        {total > 0 && values?.map((value, index) => {
          const length = (Math.max(value, 0) / total) * circumference;
          const dashOffset = -segmentOffset;
          segmentOffset += length;
          return (
            <circle
              key={`${index}-${value}`}
              r={radius}
              stroke={analyticsColors[index % analyticsColors.length]}
              strokeDasharray={`${Math.max(length - 3, 0)} ${circumference}`}
              strokeDashoffset={dashOffset}
              filter={index === 0 ? "url(#revenue-glow)" : undefined}
            />
          );
        })}
      </g>
      <circle cx="72" cy="72" r="28" fill="#0b1b24" stroke="rgba(134,194,207,.35)" />
      {total === 0 && <text x="72" y="78" textAnchor="middle" className="analytics-svg__empty">—</text>}
      {total > 0 && (
        <g className="analytics-svg__legend" transform="translate(140 34)">
          <circle cx="0" cy="0" r="4" fill="#28d9dc" /><text x="12" y="4">{locale === "ar" ? "الإيرادات" : "Revenue"}</text>
          <circle cx="0" cy="24" r="4" fill="#dbc06b" /><text x="12" y="28">{locale === "ar" ? "الهدف" : "Target"}</text>
          <circle cx="0" cy="48" r="4" fill="#62ce96" /><text x="12" y="52">{locale === "ar" ? "النمو" : "Growth"}</text>
          <circle cx="0" cy="72" r="4" fill="#3b9fc9" /><text x="12" y="76">{locale === "ar" ? "السوق" : "Market"}</text>
        </g>
      )}
    </svg>
  );
}

function TrendGraphic({ label, values, comparison }: AnalyticsGraphicProps) {
  const primaryPoints = values ? linePoints(values) : "";
  const comparisonPoints = comparison ? linePoints(comparison) : "";
  return (
    <svg className="login-gateway__analytics-svg" viewBox="0 0 220 145" role="img" aria-label={label}>
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#2bdcdd" stopOpacity=".18" />
          <stop offset="1" stopColor="#2bdcdd" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="analytics-svg__grid">
        <path d="M28 22H208M28 52H208M28 82H208M28 112H208" />
        <path d="M28 18V116H210" className="analytics-svg__axis" />
      </g>
      {primaryPoints && <polyline points={primaryPoints} className="analytics-svg__series analytics-svg__series--cyan" />}
      {comparisonPoints && <polyline points={comparisonPoints} className="analytics-svg__series analytics-svg__series--gold" />}
      {!primaryPoints && !comparisonPoints && (
        <><rect x="82" y="50" width="72" height="36" rx="8" className="analytics-svg__empty-box" /><text x="118" y="74" textAnchor="middle" className="analytics-svg__empty">—</text></>
      )}
    </svg>
  );
}

function GrowthGraphic({ label, values }: AnalyticsGraphicProps) {
  const maximum = values?.length ? Math.max(...values, 1) : 1;
  return (
    <svg className="login-gateway__analytics-svg" viewBox="0 0 220 145" role="img" aria-label={label}>
      <g className="analytics-svg__grid">
        <path d="M28 22H208M28 52H208M28 82H208M28 112H208" />
        <path d="M28 18V116H210" className="analytics-svg__axis" />
      </g>
      <g className="analytics-svg__bars">
        {values?.slice(0, 5).map((value, index) => {
          const height = (Math.max(value, 0) / maximum) * 82;
          return (
            <rect
              key={`${index}-${value}`}
              x={44 + index * 34}
              y={116 - height}
              width="20"
              height={height}
              rx="2"
              fill={`url(#${["bar-gold", "bar-cyan", "bar-green", "bar-blue", "bar-cyan"][index]})`}
            />
          );
        })}
      </g>
      <defs>
        <linearGradient id="bar-gold" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#e4c66e" /><stop offset="1" stopColor="#71562a" /></linearGradient>
        <linearGradient id="bar-cyan" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#38dcda" /><stop offset="1" stopColor="#246d7e" /></linearGradient>
        <linearGradient id="bar-green" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#66d19a" /><stop offset="1" stopColor="#285d46" /></linearGradient>
        <linearGradient id="bar-blue" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#45aee0" /><stop offset="1" stopColor="#284e79" /></linearGradient>
      </defs>
      {!values?.length && (
        <><rect x="82" y="50" width="72" height="36" rx="8" className="analytics-svg__empty-box" /><text x="118" y="74" textAnchor="middle" className="analytics-svg__empty">—</text></>
      )}
    </svg>
  );
}

function MarketGraphic({ label, values, comparison }: AnalyticsGraphicProps) {
  const primaryPolygon = values ? radarPoints(values) : "";
  const comparisonPolygon = comparison ? radarPoints(comparison) : "";
  return (
    <svg className="login-gateway__analytics-svg" viewBox="0 0 220 145" role="img" aria-label={label}>
      <g transform="translate(110 72)" fill="none">
        <circle r="52" stroke="rgba(91,193,212,.24)" />
        <circle r="35" stroke="rgba(91,193,212,.24)" />
        <circle r="18" stroke="rgba(218,186,98,.26)" />
        <path d="M0-57V57M-57 0H57M-40-40L40 40M40-40L-40 40" stroke="rgba(112,181,198,.28)" />
      </g>
      {primaryPolygon && <polygon points={primaryPolygon} fill="rgba(47,167,197,.16)" stroke="#45bed4" strokeWidth="2" />}
      {comparisonPolygon && <polygon points={comparisonPolygon} fill="rgba(220,188,99,.14)" stroke="#d8bc67" strokeWidth="1.5" />}
      {!primaryPolygon && !comparisonPolygon && (
        <><rect x="82" y="54" width="56" height="34" rx="8" className="analytics-svg__empty-box" /><text x="110" y="77" textAnchor="middle" className="analytics-svg__empty">—</text></>
      )}
    </svg>
  );
}

export function LoginGateway({ locale, languageLabel, labels }: LoginGatewayProps) {
  const ar = locale === "ar";
  const [state, setState] = useState<GatewayState>("initial");
  const [activeMetric, setActiveMetric] = useState(0);
  const [market, setMarket] = useState<LiveMarketPayload | null>(null);
  const gatewayRef = useRef<HTMLButtonElement>(null);
  const loginPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || state === "initial") return;
      event.preventDefault();
      setState("initial");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state]);

  useEffect(() => {
    const controller = new AbortController();
    async function refreshMarket() {
      try {
        const response = await fetch("/api/market/live", { cache: "no-store", signal: controller.signal });
        const payload = (await response.json()) as LiveMarketPayload;
        if (!controller.signal.aborted) setMarket(payload);
      } catch {
        if (!controller.signal.aborted) setMarket({ state: "error", provider: null, updatedAt: null, staleAt: null, instruments: [] });
      }
    }
    void refreshMarket();
    const interval = window.setInterval(() => void refreshMarket(), 30_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (state === "login") {
      requestAnimationFrame(() =>
        loginPanelRef.current
          ?.querySelector<HTMLInputElement>('input[name="email"]')
          ?.focus(),
      );
    } else if (state === "initial") {
      requestAnimationFrame(() => gatewayRef.current?.focus());
    }
  }, [state]);

  const unavailable = ar ? "غير متاح" : "Unavailable";
  const disconnected = ar ? "مزود غير متصل" : "Provider disconnected";
  const connected = market?.state === "live" || market?.state === "stale";
  const liveStatus = market?.state === "live"
    ? (ar ? "مباشر" : "Live")
    : market?.state === "stale"
      ? (ar ? "بيانات متأخرة" : "Stale data")
      : market?.state === "error"
        ? (ar ? "خطأ في المصدر" : "Provider error")
        : disconnected;
  const series = market?.instruments.map((instrument) => instrument.series) ?? [];
  const primarySeries = series[activeMetric] ?? [];
  const comparisonSeries = series[(activeMetric + 1) % Math.max(series.length, 1)] ?? [];
  const changes = market?.instruments.map((instrument) => Math.abs(instrument.percentChange ?? 0) + 0.1) ?? [];
  const prices = market?.instruments.map((instrument) => instrument.price) ?? [];
  const formatPrice = (value: number) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 2 }).format(value);

  return (
    <main className="login-gateway login-gateway--reference">
      <div className="login-gateway__canvas">
        <svg className="login-gateway__circuit-board" viewBox="0 0 1672 941" aria-hidden="true">
          <g className="circuit-paths circuit-paths--blue">
            <path d="M0 34h42l18 18h70l22 22h126l24 24h116" />
            <path d="M0 54h30l20 20h58l26 26h118l22 22h104" />
            <path d="M0 78h86l34 34h118l28 28h138" />
            <path d="M0 118h64l44 44h126l32 32h196" />
            <path d="M0 188h132l42-42h158l38 38h126" />
            <path d="M0 802h112l38-38h136l28-28h204" />
            <path d="M0 846h178l34-34h142l42-42h184" />
            <path d="M0 904h194l28-28h128l32-32h176" />
            <path d="M1672 116h-88l-36 36h-138l-32 32h-126" />
            <path d="M1672 184h-152l-30 30h-104l-40 40h-132" />
            <path d="M1672 786h-92l-42-42h-120l-36-36h-148" />
            <path d="M1672 842h-184l-34-34h-128l-44-44h-132" />
            <path d="M1672 902h-206l-26-26h-116l-38-38h-168" />
          </g>
          <g className="circuit-paths circuit-paths--green">
            <path d="M22 0v32l30 30v86l32 32" />
            <path d="M64 0v54l42 42v92l36 36" />
            <path d="M148 0v42l34 34v104l38 38" />
            <path d="M222 0v38l28 28v72l34 34" />
            <path d="M1518 0v68l-34 34v92l-42 42" />
            <path d="M1590 0v106l-32 32v108l-36 36" />
            <path d="M94 941V866l42-42v-86l34-34" />
            <path d="M42 941v-48l32-32v-72l34-34" />
            <path d="M1568 941v-94l-36-36v-88l-38-38" />
          </g>
          <g className="circuit-paths circuit-paths--gold">
            <path d="M0 96h50l26 26h76l30 30h102" />
            <path d="M0 154h102l32 32h74l38 38h124" />
            <path d="M0 872h136l28-28h106l36-36h158" />
            <path d="M0 924h158l22-22h104l34-34h126" />
            <path d="M1672 92h-72l-24 24h-86l-30 30h-108" />
            <path d="M1672 150h-122l-28 28h-92l-36 36h-128" />
            <path d="M1672 814h-128l-34-34h-98l-30-30h-154" />
            <path d="M1672 880h-164l-28-28h-112l-32-32h-136" />
          </g>
          <g className="circuit-nodes">
            <circle cx="278" cy="74" r="4" /><circle cx="378" cy="122" r="4" />
            <circle cx="404" cy="140" r="4" /><circle cx="496" cy="184" r="4" />
            <circle cx="518" cy="736" r="4" /><circle cx="580" cy="770" r="4" />
            <circle cx="1252" cy="184" r="4" /><circle cx="1214" cy="254" r="4" />
            <circle cx="1234" cy="708" r="4" /><circle cx="1150" cy="764" r="4" />
            <circle cx="444" cy="868" r="4" /><circle cx="1200" cy="820" r="4" />
          </g>
        </svg>
        <header className="login-gateway__header">
          <a href="/login" className="login-gateway__brand" aria-label="Jenan BIZ">
            <Image
              src="/assets/jenan-biz-logo-transparent.png"
              alt="Jenan BIZ"
              width={997}
              height={611}
              priority
            />
          </a>

          <section
            className="login-gateway__status gateway-glass"
            aria-label={ar ? "موجز الأسواق" : "Market brief"}
          >
            <div className="login-gateway__news-line">
              <span>{ar ? "آخر أخبار الأعمال والاستثمار" : "Latest business and investment news"}</span>
              <strong>—</strong>
              <em>{liveStatus}</em>
            </div>
            <div className="login-gateway__news-line login-gateway__news-line--secondary">
              <span>{ar ? "مؤشر الأسواق المحلية" : "Local market ticker"}</span>
              <strong>{market?.instruments[0]?.percentChange == null ? "—" : `${market.instruments[0].percentChange >= 0 ? "+" : ""}${market.instruments[0].percentChange.toFixed(2)}%`}</strong>
              <em>{connected ? market?.instruments[0]?.symbol : unavailable}</em>
            </div>
          </section>

          <div className="login-gateway__tools">
            <span className="login-gateway__connection"><i />{liveStatus}</span>
            <ThemeToggle label={ar ? "المظهر" : "Theme"} switchStyle />
            <LanguageSwitcher locale={locale} label={languageLabel} showChevron />
          </div>
        </header>

        <section className="login-gateway__environment">
          <div className="login-gateway__circuit" aria-hidden="true" />

          <div className="login-gateway__monitor-grid">
            <section className="login-gateway__opportunities">
              <header>
                <h1>{ar ? "فرص الأعمال العالمية" : "Global Business Opportunities"}</h1>
                <p>{ar ? "مصادر الفرص المباشرة غير متصلة" : "Live opportunity providers are disconnected"}</p>
              </header>
              <div className="login-gateway__opportunity-map">
                <Image
                  src="/assets/world-network-map-transparent-2560x1440.png"
                  alt={ar ? "خريطة العالم" : "World map"}
                  fill
                  sizes="820px"
                  priority
                />
                <span className="login-gateway__map-node node-a" aria-hidden="true" />
                <span className="login-gateway__map-node node-b" aria-hidden="true" />
                <span className="login-gateway__map-node node-c" aria-hidden="true" />
                <span className="login-gateway__map-node node-d" aria-hidden="true" />
                <span className="login-gateway__map-node node-e" aria-hidden="true" />
                <div className="login-gateway__map-data-state" data-testid="map-activity-state">
                  <Icon name="activity" />
                  <span>
                    <strong>{ar ? "تصور بصري فقط" : "Visual concept only"}</strong>
                    <small>{ar ? "لا توجد بيانات نشاط جغرافي متصلة" : "No geographic activity data connected"}</small>
                  </span>
                </div>
                <div className="login-gateway__map-unavailable">
                  <Icon name="globe" />
                  <span>{unavailable}</span>
                </div>
              </div>

              <button
                ref={gatewayRef}
                type="button"
                className="login-gateway__entry-button"
                onClick={() => setState("login")}
                data-testid="jenan-entry-gateway"
              >
                <Icon name="user" />
                <span><strong>{ar ? "اضغط لفتح شاشة الدخول" : "Open the sign-in screen"}</strong><small>{ar ? "دخول آمن" : "Secure access"}</small></span>
              </button>
            </section>

            <aside className="login-gateway__activity login-gateway__analytics gateway-glass" data-market-state={market?.state ?? "disconnected"}>
              <header>
                <h2>{ar ? "مؤشرات الأعمال العالمية" : "Global Business Indicators"}</h2>
                <p>{ar ? "مصادر البيانات المباشرة" : "Live data sources"}</p>
              </header>
              <div className="login-gateway__analytics-grid">
                <article className="login-gateway__chart-card" data-active={activeMetric === 0} tabIndex={0} role="button" aria-pressed={activeMetric === 0} onFocus={() => setActiveMetric(0)} onMouseEnter={() => setActiveMetric(0)} onClick={() => setActiveMetric(0)}>
                  <h3>{ar ? "الإيرادات" : "Revenue"}</h3>
                  <RevenueGraphic locale={locale} values={changes} label={`${ar ? "مزيج حركة السوق" : "Market movement mix"}: ${liveStatus}`} />
                  <small>{connected ? liveStatus : unavailable}</small>
                </article>
                <article className="login-gateway__chart-card" data-active={activeMetric === 1} tabIndex={0} role="button" aria-pressed={activeMetric === 1} onFocus={() => setActiveMetric(1)} onMouseEnter={() => setActiveMetric(1)} onClick={() => setActiveMetric(1)}>
                  <h3>{ar ? "اتجاه الأداء" : "Performance trend"}</h3>
                  <TrendGraphic values={primarySeries} comparison={comparisonSeries} label={`${ar ? "اتجاه الأداء" : "Performance trend"}: ${liveStatus}`} />
                  <small>{connected ? market?.instruments[activeMetric]?.symbol : unavailable}</small>
                </article>
                <article className="login-gateway__chart-card" data-active={activeMetric === 2} tabIndex={0} role="button" aria-pressed={activeMetric === 2} onFocus={() => setActiveMetric(2)} onMouseEnter={() => setActiveMetric(2)} onClick={() => setActiveMetric(2)}>
                  <h3>{ar ? "نمو الأعمال" : "Business growth"}</h3>
                  <GrowthGraphic values={primarySeries} label={`${ar ? "زخم السوق" : "Market momentum"}: ${liveStatus}`} />
                  <small>{connected ? liveStatus : unavailable}</small>
                </article>
                <article className="login-gateway__chart-card" data-active={activeMetric === 3} tabIndex={0} role="button" aria-pressed={activeMetric === 3} onFocus={() => setActiveMetric(3)} onMouseEnter={() => setActiveMetric(3)} onClick={() => setActiveMetric(3)}>
                  <h3>{ar ? "موقع السوق" : "Market position"}</h3>
                  <MarketGraphic values={prices} comparison={changes} label={`${ar ? "موقع السوق" : "Market position"}: ${liveStatus}`} />
                  <small>{connected ? liveStatus : unavailable}</small>
                </article>
              </div>
              <div className="login-gateway__provider-note">
                <Icon name="activity" />
                <span><strong>{market?.state === "live" ? (ar ? "البيانات المباشرة متصلة" : "Live data connected") : market?.state === "stale" ? (ar ? "آخر بيانات موثوقة" : "Last trusted snapshot") : (ar ? "البيانات المباشرة غير متاحة" : "Live data unavailable")}</strong><small>{market?.updatedAt ? `${liveStatus} · ${new Date(market.updatedAt).toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-US")}` : liveStatus}</small></span>
              </div>
            </aside>
          </div>

          {state === "login" && (
            <section
              ref={loginPanelRef}
              className="login-gateway__login-panel gateway-glass"
              role="dialog"
              aria-modal="true"
              aria-labelledby="login-gateway-title"
              data-testid="login-expanded"
            >
              <button
                type="button"
                className="login-gateway__close"
                onClick={() => setState("initial")}
                aria-label={ar ? "إغلاق نموذج الدخول" : "Close sign-in panel"}
                data-testid="close-login"
              ><Icon name="x" /></button>
              <Image className="login-gateway__login-logo" src="/assets/jenan-biz-logo-transparent.png" alt="Jenan BIZ" width={997} height={611} priority />
              <h2 id="login-gateway-title">{ar ? "تسجيل الدخول" : "Sign in"}</h2>
              <p>{ar ? "ادخل إلى بيئة أعمالك الآمنة" : "Enter your secure business environment"}</p>
              <AuthForm mode="login" locale={locale} labels={labels} />
              <button type="button" className="login-gateway__panel-back" onClick={() => setState("initial")}>
                <Icon name="arrow" />{ar ? "العودة إلى البوابة" : "Back to gateway"}
              </button>
            </section>
          )}
        </section>

        <footer className="login-gateway__ticker gateway-glass">
          <div className="login-gateway__ticker-label">
            <Icon name="activity" />
            <span>{ar ? "أخبار عالمية حية" : "Live global news"}<small>{liveStatus}</small></span>
          </div>
          {marketItems.map(([arabic, english], index) => (
            <div className="login-gateway__ticker-item" key={english}>
              <span className="login-gateway__ticker-orb">{market?.instruments[index]?.percentChange == null ? "—" : `${market.instruments[index].percentChange >= 0 ? "+" : ""}${market.instruments[index].percentChange.toFixed(1)}%`}</span>
              <b>{ar ? arabic : english}</b>
              <strong data-value={market?.instruments[index]?.price ?? undefined}>{market?.instruments[index] ? formatPrice(market.instruments[index].price) : "—"}</strong>
              <small>{connected ? market?.instruments[index]?.symbol : unavailable}</small>
            </div>
          ))}
        </footer>
      </div>
    </main>
  );
}
