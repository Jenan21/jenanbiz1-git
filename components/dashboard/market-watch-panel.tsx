"use client";

import { useEffect, useRef, useState } from "react";

interface Asset {
  symbol: string;
  label: string;
  base: number;
  value: number;
  prev: number;
  category: "metals" | "indices" | "crypto" | "forex";
  unit: string;
}

const SEED_ASSETS: Omit<Asset, "value" | "prev">[] = [
  { symbol: "XAU/USD", label: "Gold", base: 2345.80, category: "metals", unit: "$" },
  { symbol: "XAG/USD", label: "Silver", base: 29.42, category: "metals", unit: "$" },
  { symbol: "XPT/USD", label: "Platinum", base: 952.60, category: "metals", unit: "$" },
  { symbol: "S&P 500", label: "S&P 500", base: 5432.10, category: "indices", unit: "" },
  { symbol: "NASDAQ", label: "NASDAQ", base: 17845.30, category: "indices", unit: "" },
  { symbol: "DJI", label: "Dow Jones", base: 40210.50, category: "indices", unit: "" },
  { symbol: "BTC/USD", label: "Bitcoin", base: 67420.00, category: "crypto", unit: "$" },
  { symbol: "ETH/USD", label: "Ethereum", base: 3560.80, category: "crypto", unit: "$" },
  { symbol: "SOL/USD", label: "Solana", base: 168.40, category: "crypto", unit: "$" },
  { symbol: "EUR/USD", label: "EUR/USD", base: 1.0845, category: "forex", unit: "" },
  { symbol: "GBP/USD", label: "GBP/USD", base: 1.2734, category: "forex", unit: "" },
  { symbol: "USD/JPY", label: "USD/JPY", base: 154.62, category: "forex", unit: "" },
];

function seed(): Asset[] {
  return SEED_ASSETS.map((a) => ({ ...a, value: a.base, prev: a.base }));
}

function nudge(assets: Asset[]): Asset[] {
  return assets.map((a) => {
    const pct = (Math.random() - 0.496) * 0.004;
    const next = Math.max(a.base * 0.92, a.value * (1 + pct));
    return { ...a, prev: a.value, value: next };
  });
}

function fmt(a: Asset): string {
  if (a.value >= 10000) return a.value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a.value >= 100) return a.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (a.value >= 1) return a.value.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 4 });
  return a.value.toFixed(4);
}

function fmtPct(a: Asset): string {
  const pct = ((a.value - a.base) / a.base) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
}

const CATEGORY_LABELS: Record<Asset["category"], { ar: string; en: string }> = {
  metals: { ar: "المعادن", en: "Metals" },
  indices: { ar: "المؤشرات", en: "Indices" },
  crypto: { ar: "العملات الرقمية", en: "Crypto" },
  forex: { ar: "العملات", en: "Forex" },
};

const CATEGORIES: Asset["category"][] = ["metals", "indices", "crypto", "forex"];

export function MarketWatchPanel({ locale }: { locale: "ar" | "en" }) {
  const ar = locale === "ar";
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tick, setTick] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setAssets(seed());
    const id = window.setInterval(() => {
      setAssets((prev) => nudge(prev));
      setTick((t) => t + 1);
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <aside className="market-watch-panel glass" aria-label={ar ? "لوحة الأسواق" : "Market watch"}>
      <div className="mwp-header">
        <span className="mwp-title">{ar ? "الأسواق" : "Markets"}</span>
        <span className="mwp-live">
          <i className="mwp-dot" />
          {ar ? "مباشر" : "Live"}
        </span>
      </div>

      {CATEGORIES.map((cat) => {
        const catAssets = assets.filter((a) => a.category === cat);
        if (!catAssets.length) return null;
        return (
          <div className="mwp-group" key={cat}>
            <div className="mwp-group-label">{ar ? CATEGORY_LABELS[cat].ar : CATEGORY_LABELS[cat].en}</div>
            {catAssets.map((a) => {
              const up = a.value >= a.prev;
              const pct = fmtPct(a);
              const changed = a.value !== a.prev;
              return (
                <div className={`mwp-row${changed ? " mwp-row--flash" : ""}${up ? " mwp-row--up" : " mwp-row--down"}`} key={a.symbol}>
                  <div className="mwp-symbol">
                    <strong>{a.symbol}</strong>
                    <small>{a.label}</small>
                  </div>
                  <div className="mwp-value">
                    <span className="mwp-price">{a.unit}{fmt(a)}</span>
                    <span className={`mwp-pct${up ? " up" : " dn"}`}>
                      <span className="mwp-arrow" aria-hidden="true">{up ? "▲" : "▼"}</span>
                      {pct}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="mwp-footer">
        <span>{ar ? "بيانات تجريبية · مزود حي قريبًا" : "Simulated · Live provider coming"}</span>
        <span className="mwp-tick">#{tick}</span>
      </div>
    </aside>
  );
}
