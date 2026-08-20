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

const demoMarketInstruments: LiveMarketInstrument[] = [
  { symbol: "XAU/USD", price: 2431.2, percentChange: 0.8, series: [2398, 2405, 2412, 2408, 2420, 2431.2], datetime: null },
  { symbol: "WTI/USD", price: 78.4, percentChange: 0.35, series: [76.8, 77.2, 76.9, 77.8, 78.1, 78.4], datetime: null },
  { symbol: "BTC/USD", price: 61220, percentChange: 1.1, series: [59800, 60200, 60700, 60500, 61000, 61220], datetime: null },
  { symbol: "DXY", price: 102.7, percentChange: -0.2, series: [103.2, 103, 102.9, 103.1, 102.8, 102.7], datetime: null },
];

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

function RevenueGraphic({ label, values }: AnalyticsGraphicProps) {
  const points = values ? linePoints(values) : "";
  const areaPoints = points ? `30,116 ${points} 207,116` : "";
  return (
    <svg className="login-gateway__analytics-svg" viewBox="0 0 220 145" role="img" aria-label={label}>
      <defs>
        <linearGradient id="distribution-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#48cce8" stopOpacity=".22" /><stop offset="1" stopColor="#48cce8" stopOpacity="0" /></linearGradient>
      </defs>
      <g className="analytics-svg__grid">
        <path d="M28 22H208M28 52H208M28 82H208M28 112H208" />
        <path d="M28 18V116H210" className="analytics-svg__axis" />
      </g>
      {areaPoints && <polygon points={areaPoints} fill="url(#distribution-fill)" stroke="none" />}
      {points && <polyline points={points} className="analytics-svg__series analytics-svg__series--cyan" />}
      {!points && <text x="118" y="74" textAnchor="middle" className="analytics-svg__empty">—</text>}
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
  const primaryPoints = values ? linePoints(values) : "";
  const comparisonPoints = comparison ? linePoints(comparison) : "";
  return (
    <svg className="login-gateway__analytics-svg" viewBox="0 0 220 145" role="img" aria-label={label}>
      <g className="analytics-svg__grid">
        <path d="M28 22H208M28 52H208M28 82H208M28 112H208" />
        <path d="M28 18V116H210" className="analytics-svg__axis" />
      </g>
      {primaryPoints && <polyline points={primaryPoints} className="analytics-svg__series analytics-svg__series--cyan" />}
      {comparisonPoints && <polyline points={comparisonPoints} className="analytics-svg__series analytics-svg__series--gold" />}
      {!primaryPoints && !comparisonPoints && (
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

  const connected = market?.state === "live" || market?.state === "stale";
  const demo = !connected;
  const displayInstruments = connected ? market.instruments : demoMarketInstruments;
  const displayState = connected ? market.state : "demo";
  const liveStatus = market?.state === "live"
    ? (ar ? "مباشر" : "Live")
    : market?.state === "stale"
      ? (ar ? "بيانات متأخرة" : "Stale data")
      : (ar ? "بيانات تجريبية" : "Demo data");
  const series = displayInstruments.map((instrument) => instrument.series);
  const primarySeries = series[activeMetric] ?? [];
  const comparisonSeries = series[(activeMetric + 1) % Math.max(series.length, 1)] ?? [];
  const changes = displayInstruments.map((instrument) => Math.abs(instrument.percentChange ?? 0) + 0.1);
  const prices = displayInstruments.map((instrument) => instrument.price);
  const formatPrice = (value: number) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 2 }).format(value);
  const formatPercentChange = (value: number | null | undefined, digits = 2) => value == null
    ? "—"
    : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;

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
            data-market-state={displayState}
            aria-label={ar ? "موجز الأسواق" : "Market brief"}
          >
            <div className="login-gateway__news-line">
              <span>{ar ? "نبض الأسواق العالمية" : "Global market pulse"}</span>
              <strong>{formatPercentChange(displayInstruments[2]?.percentChange)}</strong>
              <em>{liveStatus}</em>
            </div>
            <div className="login-gateway__news-line login-gateway__news-line--secondary">
              <span>{ar ? "مؤشر الأسواق المحلية" : "Local market ticker"}</span>
              <strong>{formatPercentChange(displayInstruments[0]?.percentChange)}</strong>
              <em>{demo ? (ar ? "تجريبي" : "Demo") : displayInstruments[0]?.symbol}</em>
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
                    <strong>{demo ? (ar ? "مؤشرات جغرافية تجريبية" : "Demo geographic indicators") : (ar ? "مؤشرات جغرافية مباشرة" : "Live geographic indicators")}</strong>
                    <small>{demo ? (ar ? "ليست بيانات نشاط حقيقية" : "Not real activity data") : (ar ? "مصدر البيانات متصل" : "Data provider connected")}</small>
                  </span>
                </div>
                <div className="login-gateway__map-unavailable">
                  <Icon name="globe" />
                  <span>{demo ? (ar ? "تجريبي" : "Demo") : (ar ? "مباشر" : "Live")}</span>
                </div>
              </div>

              <button
                ref={gatewayRef}
                type="button"
                className="login-gateway__entry-button"
                onClick={() => setState((current) => current === "login" ? "initial" : "login")}
                aria-controls="login-gateway-panel"
                aria-expanded={state === "login"}
                aria-label={state === "login"
                  ? (ar ? "إخفاء شاشة تسجيل الدخول" : "Hide the sign-in screen")
                  : (ar ? "إظهار شاشة تسجيل الدخول" : "Show the sign-in screen")}
                data-active={state === "login"}
                data-testid="jenan-entry-gateway"
              >
                <Icon name="user" />
                <span>
                  <strong>{state === "login"
                    ? (ar ? "اضغط لإخفاء شاشة الدخول" : "Hide the sign-in screen")
                    : (ar ? "اضغط لفتح شاشة الدخول" : "Open the sign-in screen")}</strong>
                  <small>{ar ? "دخول آمن" : "Secure access"}</small>
                </span>
              </button>
            </section>

            <aside className="login-gateway__activity login-gateway__analytics gateway-glass" data-market-state={displayState}>
              <header>
                <h2>{ar ? "مؤشرات الأعمال العالمية" : "Global Business Indicators"}</h2>
                <p>{demo ? (ar ? "بيانات تجريبية حتى ربط API" : "Demo data until API connection") : (ar ? "مصادر البيانات المباشرة" : "Live data sources")}</p>
              </header>
              <div className="login-gateway__analytics-grid">
                <article className="login-gateway__chart-card" data-active={activeMetric === 0} tabIndex={0} role="button" aria-pressed={activeMetric === 0} onFocus={() => setActiveMetric(0)} onMouseEnter={() => setActiveMetric(0)} onClick={() => setActiveMetric(0)}>
                  <div className="login-gateway__metric-heading"><h3>{ar ? "توزيع الحركة" : "Movement mix"}</h3><span><strong>{formatPrice(displayInstruments[0]?.price ?? 0)}</strong><em>{formatPercentChange(displayInstruments[0]?.percentChange)}</em></span></div>
                  <RevenueGraphic values={changes} label={`${ar ? "مزيج حركة السوق" : "Market movement mix"}: ${liveStatus}`} />
                  <small>{displayInstruments[0]?.symbol} · {liveStatus}</small>
                </article>
                <article className="login-gateway__chart-card" data-active={activeMetric === 1} tabIndex={0} role="button" aria-pressed={activeMetric === 1} onFocus={() => setActiveMetric(1)} onMouseEnter={() => setActiveMetric(1)} onClick={() => setActiveMetric(1)}>
                  <div className="login-gateway__metric-heading"><h3>{ar ? "اتجاه الأداء" : "Performance trend"}</h3><span><strong>{formatPrice(displayInstruments[activeMetric]?.price ?? 0)}</strong><em>{formatPercentChange(displayInstruments[activeMetric]?.percentChange)}</em></span></div>
                  <TrendGraphic values={primarySeries} comparison={comparisonSeries} label={`${ar ? "اتجاه الأداء" : "Performance trend"}: ${liveStatus}`} />
                  <small>{displayInstruments[activeMetric]?.symbol} · {demo ? (ar ? "تجريبي" : "Demo") : liveStatus}</small>
                </article>
                <article className="login-gateway__chart-card" data-active={activeMetric === 2} tabIndex={0} role="button" aria-pressed={activeMetric === 2} onFocus={() => setActiveMetric(2)} onMouseEnter={() => setActiveMetric(2)} onClick={() => setActiveMetric(2)}>
                  <div className="login-gateway__metric-heading"><h3>{ar ? "زخم الأصول" : "Asset momentum"}</h3><span><strong>{formatPrice(displayInstruments[2]?.price ?? 0)}</strong><em>{formatPercentChange(displayInstruments[2]?.percentChange)}</em></span></div>
                  <GrowthGraphic values={primarySeries} label={`${ar ? "زخم السوق" : "Market momentum"}: ${liveStatus}`} />
                  <small>{displayInstruments[2]?.symbol} · {liveStatus}</small>
                </article>
                <article className="login-gateway__chart-card" data-active={activeMetric === 3} tabIndex={0} role="button" aria-pressed={activeMetric === 3} onFocus={() => setActiveMetric(3)} onMouseEnter={() => setActiveMetric(3)} onClick={() => setActiveMetric(3)}>
                  <div className="login-gateway__metric-heading"><h3>{ar ? "توازن السوق" : "Market balance"}</h3><span><strong>{formatPrice(displayInstruments[3]?.price ?? 0)}</strong><em>{formatPercentChange(displayInstruments[3]?.percentChange)}</em></span></div>
                  <MarketGraphic values={prices} comparison={changes} label={`${ar ? "موقع السوق" : "Market position"}: ${liveStatus}`} />
                  <small>{displayInstruments[3]?.symbol} · {liveStatus}</small>
                </article>
              </div>
              <div className="login-gateway__provider-note">
                <Icon name="activity" />
                <span><strong>{market?.state === "live" ? (ar ? "البيانات المباشرة متصلة" : "Live data connected") : market?.state === "stale" ? (ar ? "آخر بيانات موثوقة" : "Last trusted snapshot") : (ar ? "جميع الأرقام والمؤشرات تجريبية" : "All figures and indicators are demo data")}</strong><small>{market?.updatedAt && connected ? `${liveStatus} · ${new Date(market.updatedAt).toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-US")}` : (ar ? "سيتم استبدالها تلقائيًا بعد ربط API" : "They will be replaced automatically after API connection")}</small></span>
              </div>
            </aside>
          </div>

          {state === "login" && (
            <section
              id="login-gateway-panel"
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
              <span className="login-gateway__ticker-orb">{formatPercentChange(displayInstruments[index]?.percentChange, 1)}</span>
              <b>{ar ? arabic : english}</b>
              <strong data-value={displayInstruments[index]?.price ?? undefined}>{displayInstruments[index] ? formatPrice(displayInstruments[index].price) : "—"}</strong>
              <small>{displayInstruments[index]?.symbol} · {demo ? (ar ? "تجريبي" : "Demo") : liveStatus}</small>
            </div>
          ))}
        </footer>
      </div>
    </main>
  );
}
