"use client";

import { useEffect, useState } from "react";

interface TickerEntry {
  symbol: string;
  price: number;
  change: number;
}

const INITIAL: TickerEntry[] = [
  { symbol: "XAU/USD", price: 2342.5, change: 0.42 },
  { symbol: "S&P 500", price: 5308.15, change: 0.63 },
  { symbol: "NASDAQ", price: 18642.0, change: 0.88 },
  { symbol: "BTC/USD", price: 67420.0, change: 1.85 },
  { symbol: "ETH/USD", price: 3512.0, change: -0.43 },
  { symbol: "XAG/USD", price: 29.18, change: -0.31 },
  { symbol: "WTI", price: 78.45, change: 0.22 },
  { symbol: "EUR/USD", price: 1.0842, change: -0.08 },
  { symbol: "DJI", price: 39115.0, change: -0.12 },
  { symbol: "NVDA", price: 897.4, change: 2.1 },
  { symbol: "AAPL", price: 211.49, change: 1.23 },
  { symbol: "SOL/USD", price: 172.3, change: 3.21 },
];

function fmt(entry: TickerEntry): string {
  const { price } = entry;
  if (price > 10000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price > 1000) return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return price.toFixed(entry.symbol.includes("/") ? 4 : 2);
}

export function LiveMarketTicker({ locale }: { locale: "ar" | "en" }) {
  const ar = locale === "ar";
  const [tickers, setTickers] = useState<TickerEntry[]>(INITIAL);

  useEffect(() => {
    const id = setInterval(() => {
      setTickers((prev) =>
        prev.map((t) => {
          const seed = INITIAL.find((i) => i.symbol === t.symbol)!;
          const jitter = 1 + (Math.random() - 0.5) * 0.004;
          const newPrice = t.price * jitter;
          const change = ((newPrice - seed.price) / seed.price) * 100;
          return { ...t, price: newPrice, change };
        }),
      );
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="live-market-ticker glass">
      <div className="lmt-label">
        <span className="lmt-live-dot" aria-hidden="true" />
        {ar ? "الأسواق العالمية" : "Global markets"}
        <span className="lmt-sub">{ar ? "مباشر" : "Live"}</span>
      </div>
      <div className="lmt-track-wrapper" aria-hidden="true">
        {/* Duplicate for seamless loop */}
        {[0, 1].map((pass) => (
          <div key={pass} className="lmt-track">
            {tickers.map((t) => {
              const up = t.change >= 0;
              return (
                <div key={`${t.symbol}-${pass}`} className={`lmt-item ${up ? "lmt-item--up" : "lmt-item--down"}`}>
                  <strong>{t.symbol}</strong>
                  <span>{fmt(t)}</span>
                  <span className="lmt-chg">
                    {up ? "▲" : "▼"} {Math.abs(t.change).toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
