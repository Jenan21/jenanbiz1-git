"use client";

import { useEffect, useRef, useState } from "react";

// ── types ──────────────────────────────────────────────────────────────────
interface Ticker {
  symbol: string;
  name: string;
  nameAr: string;
  price: number;
  change: number; // percent
  category: "metal" | "stock" | "crypto" | "index";
}

// ── seed data – placeholders that pulse until a real feed is wired in ──────
const SEED_TICKERS: Ticker[] = [
  // metals
  { symbol: "XAU", name: "Gold", nameAr: "ذهب", price: 2342.5, change: 0.42, category: "metal" },
  { symbol: "XAG", name: "Silver", nameAr: "فضة", price: 29.18, change: -0.31, category: "metal" },
  { symbol: "XPT", name: "Platinum", nameAr: "بلاتين", price: 985.6, change: 1.07, category: "metal" },
  // indices
  { symbol: "SPX", name: "S&P 500", nameAr: "إس آند بي", price: 5308.15, change: 0.63, category: "index" },
  { symbol: "NDX", name: "Nasdaq", nameAr: "ناسداك", price: 18642.0, change: 0.88, category: "index" },
  { symbol: "DJI", name: "Dow Jones", nameAr: "داو جونز", price: 39115.0, change: -0.12, category: "index" },
  // stocks
  { symbol: "AAPL", name: "Apple", nameAr: "آبل", price: 211.49, change: 1.23, category: "stock" },
  { symbol: "MSFT", name: "Microsoft", nameAr: "مايكروسوفت", price: 430.8, change: 0.54, category: "stock" },
  { symbol: "AMZN", name: "Amazon", nameAr: "أمازون", price: 188.3, change: -0.67, category: "stock" },
  { symbol: "NVDA", name: "Nvidia", nameAr: "إنفيديا", price: 897.4, change: 2.1, category: "stock" },
  // crypto
  { symbol: "BTC", name: "Bitcoin", nameAr: "بيتكوين", price: 67420.0, change: 1.85, category: "crypto" },
  { symbol: "ETH", name: "Ethereum", nameAr: "إيثيريوم", price: 3512.0, change: -0.43, category: "crypto" },
  { symbol: "SOL", name: "Solana", nameAr: "سولانا", price: 172.3, change: 3.21, category: "crypto" },
];

const CATEGORY_LABELS: Record<Ticker["category"], [string, string]> = {
  metal:  ["Metals", "معادن"],
  stock:  ["Stocks", "أسهم"],
  crypto: ["Crypto", "عملات"],
  index:  ["Indices", "مؤشرات"],
};

const CATEGORY_ORDER: Ticker["category"][] = ["metal", "index", "stock", "crypto"];

// ── helpers ────────────────────────────────────────────────────────────────
function formatPrice(price: number, symbol: string): string {
  if (symbol === "BTC") return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price > 1000) return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return price.toFixed(2);
}

function randomJitter(base: number, magnitude = 0.003): number {
  return base * (1 + (Math.random() - 0.5) * 2 * magnitude);
}

// ── MiniSparkline ──────────────────────────────────────────────────────────
function MiniSparkline({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 56;
  const h = 22;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  const color = up ? "var(--success)" : "var(--error)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="sparkline">
      <defs>
        <linearGradient id={`sg-${up}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── TrendArrow ─────────────────────────────────────────────────────────────
function TrendArrow({ up }: { up: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      {up ? (
        <path d="M5 2L9 8H1L5 2Z" fill="var(--success)" />
      ) : (
        <path d="M5 8L9 2H1L5 8Z" fill="var(--error)" />
      )}
    </svg>
  );
}

// ── TickerRow ──────────────────────────────────────────────────────────────
function TickerRow({ ticker, ar }: { ticker: Ticker; up: boolean; ar: boolean }) {
  const [data, setData] = useState({
    price: ticker.price,
    change: ticker.change,
    history: [ticker.price * 0.998, ticker.price * 0.999, ticker.price],
  });

  useEffect(() => {
    const id = setInterval(() => {
      setData((prev) => {
        const next = randomJitter(prev.price, 0.002);
        const chg = ((next - ticker.price) / ticker.price) * 100;
        return {
          price: next,
          change: chg,
          history: [...prev.history.slice(-11), next],
        };
      });
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(id);
  }, [ticker.price]);

  const up = data.change >= 0;
  return (
    <div className={`mw-row ${up ? "mw-row--up" : "mw-row--down"}`}>
      <div className="mw-symbol">
        <span className="mw-sym-badge">{ticker.symbol}</span>
        <span className="mw-sym-name">{ar ? ticker.nameAr : ticker.name}</span>
      </div>
      <MiniSparkline values={data.history} up={up} />
      <div className="mw-right">
        <span className="mw-price">{formatPrice(data.price, ticker.symbol)}</span>
        <span className={`mw-change ${up ? "mw-change--up" : "mw-change--down"}`}>
          <TrendArrow up={up} />
          {Math.abs(data.change).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

// ── MarketWatchPanel ───────────────────────────────────────────────────────
export function MarketWatchPanel({ ar = false }: { ar?: boolean }) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    label: ar ? CATEGORY_LABELS[cat][1] : CATEGORY_LABELS[cat][0],
    items: SEED_TICKERS.filter((t) => t.category === cat),
  }));

  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <aside className="market-watch-panel glass" aria-label={ar ? "لوحة المؤشرات السوقية" : "Market watch panel"}>
      <header className="mw-header">
        <span className="mw-header__title">
          <span className="live-dot" aria-hidden="true" />
          {ar ? "السوق المباشر" : "Live Market"}
        </span>
        <span className="mw-header__sub">{ar ? "تحديث كل ثوانٍ" : "Real-time feed"}</span>
      </header>

      <div className="mw-body" ref={scrollRef}>
        {grouped.map(({ cat, label, items }) => (
          <section key={cat} className="mw-section">
            <h3 className="mw-section__label">{label}</h3>
            {items.map((t) => (
              <TickerRow key={t.symbol} ticker={t} up={t.change >= 0} ar={ar} />
            ))}
          </section>
        ))}
      </div>

      <footer className="mw-footer">
        <span>{ar ? "البيانات تقريبية — يُوصى بربط مصدر بيانات حقيقي" : "Indicative data — connect a live feed for production"}</span>
      </footer>
    </aside>
  );
}
