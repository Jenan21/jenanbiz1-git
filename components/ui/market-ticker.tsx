"use client";

import { useEffect, useRef, useState } from "react";

interface TickerEntry {
  symbol: string;
  name: string;
  price: number;
  change: number; // percentage
  category: "metals" | "stocks" | "crypto";
  sparkline: number[]; // 0-100 relative heights
}

const BASE_DATA: TickerEntry[] = [
  // Metals
  {
    symbol: "XAU",
    name: "Gold / oz",
    price: 3318.4,
    change: 0.74,
    category: "metals",
    sparkline: [45, 52, 48, 60, 74, 68, 80, 88, 84, 92],
  },
  {
    symbol: "XAG",
    name: "Silver / oz",
    price: 36.12,
    change: -0.31,
    category: "metals",
    sparkline: [60, 58, 62, 55, 50, 54, 48, 52, 46, 50],
  },
  {
    symbol: "XPT",
    name: "Platinum",
    price: 972.8,
    change: 1.05,
    category: "metals",
    sparkline: [38, 42, 50, 46, 55, 60, 58, 65, 62, 70],
  },
  // Stocks
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    price: 221.45,
    change: 0.52,
    category: "stocks",
    sparkline: [55, 60, 58, 65, 70, 68, 75, 72, 78, 80],
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    price: 285.1,
    change: -1.42,
    category: "stocks",
    sparkline: [80, 75, 72, 68, 65, 60, 55, 58, 52, 48],
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    price: 1072.3,
    change: 2.18,
    category: "stocks",
    sparkline: [40, 48, 55, 60, 65, 72, 80, 85, 88, 96],
  },
  // Crypto
  {
    symbol: "BTC",
    name: "Bitcoin",
    price: 102440.0,
    change: 1.85,
    category: "crypto",
    sparkline: [50, 58, 70, 65, 75, 85, 78, 88, 82, 92],
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    price: 3824.5,
    change: -0.68,
    category: "crypto",
    sparkline: [65, 60, 58, 55, 60, 52, 48, 52, 46, 44],
  },
  {
    symbol: "SOL",
    name: "Solana",
    price: 174.22,
    change: 3.41,
    category: "crypto",
    sparkline: [30, 40, 48, 55, 62, 70, 78, 82, 88, 95],
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  metals: "Metals",
  stocks: "Equities",
  crypto: "Digital Assets",
};

function formatPrice(symbol: string, price: number): string {
  if (symbol === "BTC") return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price < 1000) return `$${price.toFixed(2)}`;
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function UpArrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownArrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M5 2v6M8 5L5 8 2 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface MarketTickerProps {
  locale?: "ar" | "en";
  /** Show sparklines under each item */
  showSparklines?: boolean;
  className?: string;
}

export function MarketTicker({
  locale = "en",
  showSparklines = false,
  className,
}: MarketTickerProps) {
  const ar = locale === "ar";
  const [data, setData] = useState<TickerEntry[]>(BASE_DATA);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulate live micro-fluctuations every 3.2 seconds
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setData((prev) =>
        prev.map((entry) => {
          const jitter = (Math.random() - 0.5) * 0.12; // ±0.06%
          const newPrice = Math.max(0.01, entry.price * (1 + jitter / 100));
          const newChange = Math.round((entry.change + jitter * 0.8) * 100) / 100;
          return { ...entry, price: newPrice, change: newChange };
        }),
      );
    }, 3200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const grouped = (["metals", "stocks", "crypto"] as const).map((cat) => ({
    category: cat,
    items: data.filter((d) => d.category === cat),
  }));

  return (
    <div
      className={["ds-ticker", className].filter(Boolean).join(" ")}
      dir={ar ? "rtl" : "ltr"}
      aria-label={ar ? "مؤشرات السوق المالي" : "Market indicators"}
    >
      {grouped.map(({ category, items }) => (
        <div key={category}>
          <div className="ds-ticker__section-label">
            {ar
              ? category === "metals"
                ? "المعادن"
                : category === "stocks"
                  ? "الأسهم"
                  : "العملات الرقمية"
              : CATEGORY_LABELS[category]}
          </div>
          {items.map((entry) => {
            const isUp = entry.change >= 0;
            return (
              <div key={entry.symbol} className="ds-ticker__item">
                <div className="ds-ticker__left">
                  <span className="ds-ticker__symbol">{entry.symbol}</span>
                  <span className="ds-ticker__name">{entry.name}</span>
                  {showSparklines && (
                    <div
                      className="ds-ticker__sparkline"
                      style={{ color: isUp ? "var(--up)" : "var(--down)" }}
                      aria-hidden="true"
                    >
                      {entry.sparkline.map((h, i) => (
                        <span key={i} style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="ds-ticker__right">
                  <span className="ds-ticker__price" style={{ color: isUp ? "var(--up)" : "var(--down)" }}>
                    {formatPrice(entry.symbol, entry.price)}
                  </span>
                  <span
                    className={`ds-ticker__change ds-ticker__change--${isUp ? "up" : "down"}`}
                    aria-label={`${isUp ? "+" : ""}${entry.change.toFixed(2)}%`}
                  >
                    {isUp ? <UpArrow /> : <DownArrow />}
                    {isUp ? "+" : ""}
                    {entry.change.toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div
        style={{
          fontSize: "8px",
          color: "var(--muted)",
          padding: "8px 10px 4px",
          opacity: 0.7,
        }}
      >
        {ar ? "* البيانات لأغراض العرض. يتطلب مزود بيانات حقيقي." : "* Display data. Real provider required for live feeds."}
      </div>
    </div>
  );
}
