"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { ThemeToggle } from "@/components/source/source-controls";
import { Icon } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";

type GatewayState = "initial" | "login" | "register";

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
  ["الأسهم المحلية", "Local equities"],
  ["BTC / USD", "BTC / USD"],
  ["مؤشر الدولار", "Dollar index"],
] as const;

const activeServices = [
  { arabic: "سوق جنان", english: "Jenan Market", icon: "trend" as const },
  { arabic: "التوظيف الذكي", english: "AI Recruitment", icon: "building" as const },
  { arabic: "برامج الأعمال", english: "Business Programs", icon: "wallet" as const },
  { arabic: "الشراكات", english: "Partnerships", icon: "people" as const },
] as const;

interface LiveMarketInstrument {
  symbol: string;
  price: number;
  percentChange: number | null;
  series: number[];
  datetime: string | null;
  category?: "metals" | "local-equities" | "crypto" | "macro";
  liquidityShare?: number | null;
}

interface LiveMarketPayload {
  state: "live" | "stale" | "disconnected" | "error";
  provider: string | null;
  updatedAt: string | null;
  staleAt: string | null;
  instruments: LiveMarketInstrument[];
  audience?: {
    countryCode: string | null;
    countrySource: "vercel" | "unavailable";
  };
}

const demoMarketInstruments: LiveMarketInstrument[] = [
  { symbol: "XAU/USD", price: 2431.2, percentChange: 0.8, series: [2398, 2420, 2447, 2408, 2438, 2431.2], datetime: null, category: "metals", liquidityShare: 31 },
  { symbol: "TASI", price: 12174.4, percentChange: 0.35, series: [12018, 12190, 12230, 12102, 12138, 12174.4], datetime: null, category: "local-equities", liquidityShare: 44 },
  { symbol: "BTC/USD", price: 61220, percentChange: 1.1, series: [59800, 62000, 62500, 60500, 61000, 61220], datetime: null, category: "crypto", liquidityShare: 25 },
  { symbol: "DXY", price: 102.7, percentChange: -0.2, series: [103.2, 103, 102.9, 103.1, 102.8, 102.7], datetime: null, category: "macro", liquidityShare: null },
];

const financialNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function formatPrice(value: number) {
  return financialNumberFormatter.format(value);
}

function formatPercentChange(value: number | null | undefined, digits = 2) {
  return value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

const countryNames: Record<string, { ar: string; en: string }> = {
  SA: { ar: "السعودية", en: "Saudi Arabia" },
  AE: { ar: "الإمارات", en: "United Arab Emirates" },
  US: { ar: "الولايات المتحدة", en: "United States" },
  GB: { ar: "المملكة المتحدة", en: "United Kingdom" },
  DE: { ar: "ألمانيا", en: "Germany" },
  FR: { ar: "فرنسا", en: "France" },
  JP: { ar: "اليابان", en: "Japan" },
  CN: { ar: "الصين", en: "China" },
  IN: { ar: "الهند", en: "India" },
  EG: { ar: "مصر", en: "Egypt" },
};

function ServiceInstrumentGraphic({ name }: { name: (typeof activeServices)[number]["icon"] }) {
  const gradientId = `service-instrument-${name}`;
  return (
    <svg className="login-gateway__service-graphic" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="currentColor" stopOpacity=".94" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".28" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {name === "trend" && <>
          <path d="M13 47V34h8v13M27 47V27h8v20M41 47V19h8v28" fill={`url(#${gradientId})`} strokeWidth="1.6" />
          <path d="m13 29 10-8 9 5 17-14M42 12h7v7" strokeWidth="2.8" />
          <path d="M11 49h40" strokeWidth="1.4" opacity=".72" />
        </>}
        {name === "building" && <>
          <path d="M11 25 32 12l21 13H11Z" fill={`url(#${gradientId})`} strokeWidth="1.7" />
          <path d="M15 28h34M18 28v20M27 28v20M37 28v20M46 28v20M13 49h38" strokeWidth="2" />
          <path d="M28 19h8" strokeWidth="2.4" />
        </>}
        {name === "wallet" && <>
          <circle cx="37" cy="22" r="10" fill={`url(#${gradientId})`} strokeWidth="1.8" />
          <path d="M34 17h4.5a3 3 0 0 1 0 6H35a3 3 0 0 0 0 6h5M37 14v18" strokeWidth="1.6" />
          <path d="M10 39c7-4 12-4 18 0l8 4 13-5c3-1 5 3 2 5L35 53c-3 2-7 1-10-1l-14-8" strokeWidth="2.2" />
          <path d="M8 36v12" strokeWidth="3" />
        </>}
        {name === "people" && <>
          <path d="m8 34 11-12 10 8-11 13Z" fill={`url(#${gradientId})`} strokeWidth="1.7" />
          <path d="m56 34-11-12-10 8 11 13Z" fill={`url(#${gradientId})`} strokeWidth="1.7" />
          <path d="m23 29 7-5c2-1 4-1 6 0l6 5-8 8c-2 2-5 2-7 0l-3-3" strokeWidth="2.2" />
          <path d="m19 38 9 8c2 2 5 2 7 0l10-9M26 40l5 4M32 37l6 5M38 34l5 4" strokeWidth="2" />
          <path d="m10 35 5 5M54 35l-5 5" strokeWidth="2.7" />
        </>}
      </g>
    </svg>
  );
}

function gaugeScore(instrument?: LiveMarketInstrument) {
  if (!instrument) return 0;
  const values = [...instrument.series, instrument.price].filter(Number.isFinite);
  if (!values.length) return 0;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  if (range <= 0) return 50;
  return Math.max(4, Math.min(96, ((instrument.price - minimum) / range) * 100));
}

interface MarketGaugeGraphicProps {
  instrument?: LiveMarketInstrument;
  label: string;
  accent: string;
  locale: Locale;
}

function MarketGaugeGraphic({ instrument, label, accent, locale }: MarketGaugeGraphicProps) {
  const score = gaugeScore(instrument);
  const needleAngle = -90 + score * 1.8;
  const available = Boolean(instrument);
  return (
    <svg
      className="login-gateway__analytics-svg market-gauge"
      viewBox="0 0 220 145"
      role="img"
      aria-label={label}
      data-gauge-value={available ? score.toFixed(1) : "unavailable"}
    >
      <defs>
        <filter id={`gauge-glow-${instrument?.category ?? "empty"}`} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id={`gauge-face-${instrument?.category ?? "empty"}`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#18394b" stopOpacity=".92" />
          <stop offset="1" stopColor="#061824" stopOpacity=".96" />
        </linearGradient>
      </defs>
      <path className="market-gauge__face" d="M25 108A85 85 0 0 1 195 108L177 108A67 67 0 0 0 43 108Z" fill={`url(#gauge-face-${instrument?.category ?? "empty"})`} />
      <path className="market-gauge__track" d="M34 106A76 76 0 0 1 186 106" pathLength={100} />
      {available ? <path className="market-gauge__value" d="M34 106A76 76 0 0 1 186 106" pathLength={100} stroke={accent} strokeDasharray={`${score} 100`} filter={`url(#gauge-glow-${instrument?.category ?? "empty"})`} /> : null}
      <g className="market-gauge__ticks">
        {Array.from({ length: 11 }, (_, index) => (
          <line
            key={index}
            x1="110"
            y1={index % 5 === 0 ? "27" : "31"}
            x2="110"
            y2="39"
            transform={`rotate(${-90 + index * 18} 110 106)`}
          />
        ))}
      </g>
      <g className="market-gauge__needle" style={{ transform: `rotate(${needleAngle}deg)` }}>
        <path d="M106 106 110 43 114 106Z" fill={available ? accent : "#607681"} />
      </g>
      <circle className="market-gauge__hub" cx="110" cy="106" r="9" />
      <circle cx="110" cy="106" r="3.5" fill={available ? accent : "#607681"} />
      <text className="market-gauge__scale market-gauge__scale--low" x="24" y="127">{locale === "ar" ? "منخفض" : "LOW"}</text>
      <text className="market-gauge__scale market-gauge__scale--high" x="196" y="127" textAnchor="end">{locale === "ar" ? "مرتفع" : "HIGH"}</text>
      <text className="market-gauge__score" x="110" y="137" textAnchor="middle">{available ? `${Math.round(score)}%` : "—"}</text>
    </svg>
  );
}

interface LiquidityShare {
  key: "metals" | "local-equities" | "crypto";
  label: string;
  value: number;
  color: string;
}

function LiquidityRingGraphic({ shares, label, locale }: { shares: LiquidityShare[]; label: string; locale: Locale }) {
  const centerX = 66;
  const centerY = 72;
  const radius = 52;
  const circumference = Math.PI * 2 * radius;
  const total = shares.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  let accumulatedRatio = 0;
  const segments = total > 0
    ? shares.map((share) => {
        const ratio = Math.max(share.value, 0) / total;
        const length = ratio * circumference;
        const dashOffset = -(accumulatedRatio * circumference);
        const middleAngle = -90 + (accumulatedRatio + ratio / 2) * 360;
        accumulatedRatio += ratio;
        return { share, ratio, length, dashOffset, middleAngle };
      })
    : [];

  function polarPoint(angle: number, distance: number) {
    const radians = (angle * Math.PI) / 180;
    return {
      x: centerX + Math.cos(radians) * distance,
      y: centerY + Math.sin(radians) * distance,
    };
  }

  return (
    <svg className="login-gateway__analytics-svg liquidity-ring" viewBox="0 0 220 145" role="img" aria-label={label} lang={locale}>
      <defs>
        <filter id="liquidity-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.8" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <g transform={`translate(${centerX} ${centerY}) rotate(-90)`} fill="none" strokeWidth="13">
        <circle r={radius} stroke="rgba(122,171,183,.16)" />
        {segments.map(({ share, length, dashOffset }, index) => (
          <circle className="liquidity-ring__segment" key={share.key} r={radius} stroke={share.color} strokeDasharray={`${Math.max(length - 3, 0)} ${circumference}`} strokeDashoffset={dashOffset} filter={index === 0 ? "url(#liquidity-glow)" : undefined} />
        ))}
      </g>
      <g className="liquidity-ring__leaders" aria-hidden="true">
        {segments.map(({ share, ratio, middleAngle }) => {
          const start = polarPoint(middleAngle, radius + 6);
          const elbow = polarPoint(middleAngle, radius + 13);
          const pointsRight = Math.cos((middleAngle * Math.PI) / 180) >= 0;
          const endX = elbow.x + (pointsRight ? 18 : -18);
          return (
            <g key={`leader-${share.key}`}>
              <polyline points={`${start.x.toFixed(1)},${start.y.toFixed(1)} ${elbow.x.toFixed(1)},${elbow.y.toFixed(1)} ${endX.toFixed(1)},${elbow.y.toFixed(1)}`} stroke={share.color} />
              <circle cx={start.x} cy={start.y} r="1.7" fill={share.color} />
              <text x={endX + (pointsRight ? 3 : -3)} y={elbow.y + 2.5} textAnchor={pointsRight ? "start" : "end"}>{`${Math.round(ratio * 100)}%`}</text>
            </g>
          );
        })}
      </g>
      <circle className="liquidity-ring__core" cx={centerX} cy={centerY} r="33" />
      <text className="liquidity-ring__total" x={centerX} y={centerY - 3} textAnchor="middle">{total > 0 ? "100%" : "—"}</text>
      <text className="liquidity-ring__caption" x={centerX} y={centerY + 12} textAnchor="middle">{locale === "ar" ? "السيولة" : "LIQUIDITY"}</text>
      <g className="liquidity-ring__legend" transform="translate(132 36)">
        {shares.map((share, index) => (
          <g key={share.key} transform={`translate(0 ${index * 31})`}>
            <circle cx="4" cy="0" r="3.5" fill={share.color} />
            <text x="78" y="-3" textAnchor="end">{share.label}</text>
            <text className="liquidity-ring__percent" x="78" y="11" textAnchor="end">{total > 0 ? `${Math.round((share.value / total) * 100)}%` : "—"}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export function LoginGateway({ locale, languageLabel, labels }: LoginGatewayProps) {
  const ar = locale === "ar";
  const [state, setState] = useState<GatewayState>("initial");
  const [activeMetric, setActiveMetric] = useState(0);
  const [market, setMarket] = useState<LiveMarketPayload | null>(null);
  const gatewayRef = useRef<HTMLButtonElement>(null);
  const registerGatewayRef = useRef<HTMLButtonElement>(null);
  const lastGatewayRef = useRef<Exclude<GatewayState, "initial">>("login");
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
    if (state !== "initial") {
      requestAnimationFrame(() =>
        loginPanelRef.current
          ?.querySelector<HTMLInputElement>(state === "register" ? 'input[name="name"]' : 'input[name="email"]')
          ?.focus(),
      );
    } else if (state === "initial") {
      requestAnimationFrame(() =>
        (lastGatewayRef.current === "register" ? registerGatewayRef.current : gatewayRef.current)?.focus(),
      );
    }
  }, [state]);

  const connected = market?.state === "live" || market?.state === "stale";
  const demo = !connected;
  const displayInstruments = connected ? market.instruments : demoMarketInstruments;
  const displayState = connected ? market.state : "demo";
  const headlineMarketChange = demo ? 1.12 : displayInstruments[2]?.percentChange;
  const headlineAramcoPrice = demo ? 33.45 : (displayInstruments[0]?.price ?? 0);
  const headlineAramcoChange = demo ? 0.5 : displayInstruments[0]?.percentChange;
  const liveStatus = market?.state === "live"
    ? (ar ? "مباشر" : "Live")
    : market?.state === "stale"
      ? (ar ? "بيانات متأخرة" : "Stale data")
      : (ar ? "بيانات تجريبية" : "Demo data");
  const metalsInstrument = displayInstruments.find((instrument) => instrument.category === "metals") ?? displayInstruments[0];
  const localInstrument = displayInstruments.find((instrument) => instrument.category === "local-equities") ?? displayInstruments[1];
  const cryptoInstrument = displayInstruments.find((instrument) => instrument.category === "crypto") ?? displayInstruments[2];
  const countryCode = market?.audience?.countryCode ?? (demo ? "SA" : null);
  const countryName = countryCode
    ? (countryNames[countryCode]?.[ar ? "ar" : "en"] ?? countryCode)
    : (ar ? "غير محددة" : "Not detected");
  const liquidityShares: LiquidityShare[] = [
    { key: "metals", label: ar ? "المعادن" : "Metals", value: metalsInstrument?.liquidityShare ?? 0, color: "#e1c66d" },
    { key: "local-equities", label: ar ? "الأسهم" : "Local", value: localInstrument?.liquidityShare ?? 0, color: "#58d69d" },
    { key: "crypto", label: ar ? "الرقمية" : "Crypto", value: cryptoInstrument?.liquidityShare ?? 0, color: "#35d9df" },
  ];
  // The approved display reference uses Latin financial numerals in both locales.
  const toggleGateway = (next: Exclude<GatewayState, "initial">) => {
    lastGatewayRef.current = next;
    setState((current) => current === next ? "initial" : next);
  };
  const registerLabels = {
    ...labels,
    submit: ar ? "إنشاء الحساب" : "Create account",
    loading: ar ? "جارٍ إنشاء الحساب..." : "Creating account...",
    remember: "",
    forgot: "",
    note: ar ? "كلمة المرور 12 حرفًا على الأقل" : "Password must contain at least 12 characters",
    errors: {
      ...labels.errors,
      DUPLICATE_EMAIL: ar ? "البريد الإلكتروني مستخدم بالفعل." : "This email is already registered.",
      VALIDATION_ERROR: ar ? "تحقق من البيانات المدخلة." : "Please check the entered information.",
      NETWORK: ar ? "تعذر الاتصال بالخادم." : "Could not connect to the server.",
      UNKNOWN: ar ? "تعذر إنشاء الحساب." : "Account creation failed.",
    },
  };

  return (
    <main className="login-gateway login-gateway--reference" data-locale={locale} data-market-state={displayState}>
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
            <svg className="login-gateway__brand-circuit" viewBox="0 0 360 130" aria-hidden="true">
              <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path className="brand-trace brand-trace--cyan brand-trace--soft" d="M8 12h51l12 12h58" />
                <path className="brand-trace brand-trace--green brand-trace--soft" d="M0 30h48l15 15h52l13 13h80" />
                <path className="brand-trace brand-trace--cyan" d="M18 49h70l14 14h69l19 19h162" />
                <path className="brand-trace brand-trace--green" d="M0 70h61l17-17h54l20 20h196" />
                <path className="brand-trace brand-trace--cyan" d="M13 88h77l15-15h51l20 20h172" />
                <path className="brand-trace brand-trace--gold" d="M0 106h94l16-16h68l18 18h139" />
                <path className="brand-trace brand-trace--cyan" d="M25 123h84l16-16h56l18 18h146" />
                <path className="brand-trace brand-trace--cyan brand-trace--soft" d="M71 16v20l15 15h42" />
                <path className="brand-trace brand-trace--gold brand-trace--soft" d="M96 0v25l18 18h48" />
                <path className="brand-trace brand-trace--green brand-trace--soft" d="M57 73v25l19 19h48" />
                <path className="brand-trace brand-trace--gold" d="M126 30h36l12 12h66" />
                <path className="brand-trace brand-trace--cyan brand-trace--soft" d="M137 99h33l13-13h58" />
              </g>
              <g className="brand-trace-nodes">
                <circle className="brand-node brand-node--cyan" cx="352" cy="82" r="2.5" />
                <circle className="brand-node brand-node--green" cx="348" cy="73" r="2.3" />
                <circle className="brand-node brand-node--cyan" cx="348" cy="93" r="2.4" />
                <circle className="brand-node brand-node--gold" cx="335" cy="108" r="2.4" />
                <circle className="brand-node brand-node--cyan" cx="345" cy="125" r="2.3" />
                <circle className="brand-node brand-node--gold" cx="240" cy="42" r="2.2" />
                <circle className="brand-node brand-node--cyan" cx="241" cy="86" r="2.2" />
                <circle className="brand-node brand-node--green" cx="208" cy="58" r="2.1" />
              </g>
            </svg>
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
              <span>
                {ar ? "مؤشر تداول الرياض (TASI) حاليًا: " : "Riyadh Market Ticker (TASI) Current: "}
                <b>{formatPercentChange(headlineMarketChange)}</b>
                {ar ? " | سهم أرامكو (2222): " : " | Saudi Aramco (2222): "}
                <b>{formatPrice(headlineAramcoPrice)}</b>
                {ar ? " ريال " : " SAR "}
                <b>{formatPercentChange(headlineAramcoChange, 1)}</b>
                {ar ? " | آخر أخبار الاستثمار في السعودية..." : " | Latest KSA Investment News..."}
              </span>
            </div>
            <div className="login-gateway__news-line login-gateway__news-line--secondary">
              {ar ? (
                <span className="login-gateway__news-arabic">
                  آخر أخبار الاستثمار في السعودية... | <b>{formatPrice(headlineAramcoPrice)} ريال</b>
                  {" "}<b>{formatPercentChange(headlineAramcoChange, 1)}</b>
                  {" | سهم أرامكو (2222): "}<b>{formatPrice(headlineAramcoPrice)} ريال</b>
                  {" "}<b>{formatPercentChange(headlineAramcoChange, 1)}</b>
                  {" | مؤشر تداول الرياض (TASI) حاليًا: "}<b>{formatPercentChange(headlineMarketChange)}</b>
                </span>
              ) : (
                <span className="login-gateway__news-english">
                  Riyadh Market Ticker (TASI) Current: <b>{formatPercentChange(headlineMarketChange)}</b>
                  {" | "}Saudi Aramco (2222): <b>{formatPrice(headlineAramcoPrice)} SAR</b>
                  {" "}<b>{formatPercentChange(headlineAramcoChange, 1)}</b>
                  {" | Latest KSA Investment News..."}
                </span>
              )}
              <i>{demo ? (ar ? "بيانات تجريبية" : "Demo data") : liveStatus}</i>
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
            <aside className="login-gateway__services gateway-glass" aria-label={ar ? "الخدمات النشطة" : "Active services"}>
              <header>
                <h2>{ar ? "خدماتك النشطة" : "Your Active Services"}</h2>
                <p>{ar ? "خدمات عالمية متكاملة" : "Integrated global services"}</p>
              </header>
              <div className="login-gateway__service-list">
                {activeServices.map((service, index) => {
                  const instrument = displayInstruments[index];
                  const recentValues = instrument?.series.slice(-3) ?? [];
                  return (
                    <article className="login-gateway__service" key={service.english}>
                      <div className="login-gateway__service-icon"><ServiceInstrumentGraphic name={service.icon} /></div>
                      <div className="login-gateway__service-copy">
                        <strong>{ar ? service.arabic : service.english}</strong>
                      </div>
                      <div className="login-gateway__service-values">
                        <i>{instrument ? formatPrice(instrument.price) : "—"}</i>
                        <i>{formatPercentChange(instrument?.percentChange, 1)}</i>
                        {recentValues.map((value, valueIndex) => <i key={`${service.english}-${valueIndex}`}>{formatPrice(value)}</i>)}
                        <i>{demo ? (ar ? "تجريبي" : "Demo") : (ar ? "مباشر" : "Live")}</i>
                      </div>
                    </article>
                  );
                })}
              </div>
            </aside>

            <section className="login-gateway__opportunities" aria-label={ar ? "الخريطة العالمية" : "Global map"}>
              <div className="login-gateway__opportunity-map">
                <Image
                  src="/assets/world-map-reference-interior-feathered-1672x941.png"
                  alt={ar ? "خريطة العالم" : "World map"}
                  fill
                  sizes="820px"
                  priority
                />
                <svg className="login-gateway__map-network" viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="map-route-cyan" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#47d5f1" stopOpacity=".18" /><stop offset=".5" stopColor="#72edec" stopOpacity=".82" /><stop offset="1" stopColor="#47d5f1" stopOpacity=".18" /></linearGradient>
                    <linearGradient id="map-route-gold" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#dfc26d" stopOpacity=".16" /><stop offset=".55" stopColor="#f4d982" stopOpacity=".74" /><stop offset="1" stopColor="#dfc26d" stopOpacity=".14" /></linearGradient>
                    <filter id="map-route-glow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="2" result="route-blur" /><feMerge><feMergeNode in="route-blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  </defs>
                  <g className="map-network__routes" fill="none" filter="url(#map-route-glow)">
                    <path className="map-route map-route--cyan" d="M180 218C255 150 345 168 420 244" />
                    <path className="map-route map-route--green" d="M420 244C470 198 520 196 570 234" />
                    <path className="map-route map-route--gold" d="M570 234C625 174 674 176 710 208" />
                    <path className="map-route map-route--cyan" d="M710 208C790 226 836 282 820 343" />
                    <path className="map-route map-route--gold map-route--long" d="M180 218C330 70 580 68 710 208" />
                    <path className="map-route map-route--green map-route--long" d="M420 244C570 104 770 160 820 343" />
                  </g>
                </svg>
                <span className="login-gateway__map-node node-a" aria-hidden="true" />
                <span className="login-gateway__map-node node-b" aria-hidden="true" />
                <span className="login-gateway__map-node node-c" aria-hidden="true" />
                <span className="login-gateway__map-node node-d" aria-hidden="true" />
                <span className="login-gateway__map-node node-e" aria-hidden="true" />
                <span className="login-gateway__map-node node-f" aria-hidden="true" />
                <span className="login-gateway__map-node node-g" aria-hidden="true" />
                <span className="login-gateway__map-node node-h" aria-hidden="true" />
                <div className="login-gateway__map-pager" aria-hidden="true">
                  <i /><i /><i className="active" /><i /><i /><i /><i />
                </div>
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
                <div
                  className="login-gateway__access-switch"
                  role="group"
                  aria-label={ar ? "الدخول أو إنشاء حساب" : "Sign in or create an account"}
                >
                  <button
                    ref={gatewayRef}
                    type="button"
                    className="login-gateway__access-button login-gateway__access-button--login"
                    onClick={() => toggleGateway("login")}
                    aria-controls="login-gateway-panel"
                    aria-expanded={state === "login"}
                    aria-label={state === "login"
                      ? (ar ? "إخفاء تسجيل الدخول" : "Hide sign in")
                      : (ar ? "فتح تسجيل الدخول" : "Open sign in")}
                    data-active={state === "login"}
                    data-testid="jenan-entry-gateway"
                  >
                    <Icon name="user" />
                    <span>{ar ? "تسجيل الدخول" : "Sign in"}</span>
                  </button>
                  <button
                    ref={registerGatewayRef}
                    type="button"
                    className="login-gateway__access-button login-gateway__access-button--register"
                    onClick={() => toggleGateway("register")}
                    aria-controls="login-gateway-panel"
                    aria-expanded={state === "register"}
                    aria-label={state === "register"
                      ? (ar ? "إخفاء إنشاء الحساب" : "Hide account creation")
                      : (ar ? "فتح إنشاء حساب" : "Open account creation")}
                    data-active={state === "register"}
                    data-testid="jenan-register-gateway"
                  >
                    <Icon name="plus" />
                    <span>{ar ? "إنشاء حساب" : "Create account"}</span>
                  </button>
                </div>
              </div>
            </section>

            <aside className="login-gateway__activity login-gateway__analytics gateway-glass" data-market-state={displayState}>
              <header>
                <h2>{ar ? "مؤشرات السوق الذكية" : "Smart Market Indicators"}</h2>
                <p>{ar ? "معادن · أسهم محلية · عملات رقمية · سيولة" : "Metals · Local equities · Crypto · Liquidity"}</p>
              </header>
              <div className="login-gateway__analytics-grid">
                <article className="login-gateway__chart-card login-gateway__chart-card--liquidity" data-active={activeMetric === 3} tabIndex={0} role="button" aria-pressed={activeMetric === 3} onFocus={() => setActiveMetric(3)} onMouseEnter={() => setActiveMetric(3)} onClick={() => setActiveMetric(3)}>
                  <div className="login-gateway__metric-heading"><h3>{ar ? "استحواذ السيولة" : "Liquidity Share"}</h3><span><em>{liveStatus}</em></span></div>
                  <LiquidityRingGraphic locale={locale} shares={liquidityShares} label={`${ar ? "استحواذ كل فئة من السيولة" : "Liquidity share by asset class"}: ${liveStatus}`} />
                  <small>{demo ? (ar ? "توزيع تجريبي للفئات" : "Demo category distribution") : (liquidityShares.some((item) => item.value > 0) ? liveStatus : (ar ? "غير متاح من المزود" : "Unavailable from provider"))}</small>
                </article>
                <article className="login-gateway__chart-card login-gateway__chart-card--metals" data-active={activeMetric === 0} tabIndex={0} role="button" aria-pressed={activeMetric === 0} onFocus={() => setActiveMetric(0)} onMouseEnter={() => setActiveMetric(0)} onClick={() => setActiveMetric(0)}>
                  <div className="login-gateway__metric-heading"><h3>{ar ? "مؤشر المعادن" : "Metals Gauge"}</h3><span><strong>{metalsInstrument ? formatPrice(metalsInstrument.price) : "—"}</strong><em>{formatPercentChange(metalsInstrument?.percentChange)}</em></span></div>
                  <MarketGaugeGraphic locale={locale} instrument={metalsInstrument} accent="#e2c66e" label={`${ar ? "عداد سعر المعادن" : "Metals price gauge"}: ${liveStatus}`} />
                  <small>{metalsInstrument?.symbol ?? "—"} · {liveStatus}</small>
                </article>
                <article className="login-gateway__chart-card login-gateway__chart-card--local" data-active={activeMetric === 1} tabIndex={0} role="button" aria-pressed={activeMetric === 1} onFocus={() => setActiveMetric(1)} onMouseEnter={() => setActiveMetric(1)} onClick={() => setActiveMetric(1)}>
                  <div className="login-gateway__metric-heading"><h3>{ar ? `الأسهم المحلية · ${countryName}` : `${countryName} Equities`}</h3><span><strong>{localInstrument ? formatPrice(localInstrument.price) : "—"}</strong><em>{formatPercentChange(localInstrument?.percentChange)}</em></span></div>
                  <MarketGaugeGraphic locale={locale} instrument={localInstrument} accent="#5bd99f" label={`${ar ? "عداد الأسهم المحلية" : "Local equities gauge"}: ${countryName}`} />
                  <small>{localInstrument?.symbol ?? "—"} · {countryName} · {liveStatus}</small>
                </article>
                <article className="login-gateway__chart-card login-gateway__chart-card--crypto" data-active={activeMetric === 2} tabIndex={0} role="button" aria-pressed={activeMetric === 2} onFocus={() => setActiveMetric(2)} onMouseEnter={() => setActiveMetric(2)} onClick={() => setActiveMetric(2)}>
                  <div className="login-gateway__metric-heading"><h3>{ar ? "العملات الرقمية" : "Digital Assets"}</h3><span><strong>{cryptoInstrument ? formatPrice(cryptoInstrument.price) : "—"}</strong><em>{formatPercentChange(cryptoInstrument?.percentChange)}</em></span></div>
                  <MarketGaugeGraphic locale={locale} instrument={cryptoInstrument} accent="#39dbe1" label={`${ar ? "عداد العملات الرقمية" : "Digital assets gauge"}: ${liveStatus}`} />
                  <small>{cryptoInstrument?.symbol ?? "—"} · {liveStatus}</small>
                </article>
              </div>
              <div className="login-gateway__provider-note">
                <Icon name="activity" />
                <span><strong>{market?.state === "live" ? (ar ? "البيانات المباشرة متصلة" : "Live data connected") : market?.state === "stale" ? (ar ? "آخر بيانات موثوقة" : "Last trusted snapshot") : (ar ? "جميع الأرقام والمؤشرات تجريبية" : "All figures and indicators are demo data")}</strong><small>{market?.updatedAt && connected ? `${countryName} · ${liveStatus} · ${new Date(market.updatedAt).toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-US")}` : (ar ? `السوق المحلي التجريبي: ${countryName} · سيتم استبداله تلقائيًا بعد ربط API` : `Demo local market: ${countryName} · Replaced automatically after API connection`)}</small></span>
              </div>
            </aside>
          </div>

          {state !== "initial" && (
            <section
              id="login-gateway-panel"
              ref={loginPanelRef}
              className="login-gateway__login-panel gateway-glass"
              role="dialog"
              aria-modal="true"
              aria-labelledby="login-gateway-title"
              data-auth-mode={state}
              data-testid="login-expanded"
            >
              <button
                type="button"
                className="login-gateway__close"
                onClick={() => setState("initial")}
                aria-label={state === "login"
                  ? (ar ? "إغلاق نموذج الدخول" : "Close sign-in panel")
                  : (ar ? "إغلاق نموذج إنشاء الحساب" : "Close account creation panel")}
                data-testid="close-login"
              ><Icon name="x" /></button>
              <Image className="login-gateway__login-logo" src="/assets/jenan-biz-logo-transparent.png" alt="Jenan BIZ" width={997} height={611} priority />
              <h2 id="login-gateway-title">{state === "login"
                ? (ar ? "تسجيل الدخول" : "Sign in")
                : (ar ? "إنشاء حساب" : "Create account")}</h2>
              <p>{state === "login"
                ? (ar ? "ادخل إلى بيئة أعمالك الآمنة" : "Enter your secure business environment")
                : (ar ? "أنشئ مساحة أعمالك الآمنة" : "Create your secure business workspace")}</p>
              <AuthForm mode={state} locale={locale} labels={state === "register" ? registerLabels : labels} />
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
