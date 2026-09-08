"use client";

import world from "@svg-maps/world";
import { useState } from "react";
import { svgPathBbox } from "svg-path-bbox";

interface WorldLocation {
  id: string;
  name: string;
  path: string;
}

export interface GatewayActivityLocation {
  activeUsers: number;
  countryCode: string;
  countryName: { ar: string; en: string };
}

const countryCenters = new Map(
  (world.locations as WorldLocation[]).map((location) => {
    const [minX, minY, maxX, maxY] = svgPathBbox(location.path);
    return [location.id.toUpperCase(), { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }] as const;
  }),
);

export function GatewayWorldMap({ activity, locale }: { activity: GatewayActivityLocation[]; locale: "ar" | "en" }) {
  const [focusedCountry, setFocusedCountry] = useState<string | null>(null);
  const activityByCountry = new Map(activity.map((location) => [location.countryCode, location]));
  const focused = focusedCountry ? activityByCountry.get(focusedCountry) : undefined;
  const focusedCenter = focused ? countryCenters.get(focused.countryCode) : undefined;

  return (
    <svg
      className="gateway-world-map"
      viewBox={world.viewBox}
      role="img"
      aria-label="Global Jenan BIZ network"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="gateway-ocean" cx="52%" cy="46%" r="62%">
          <stop offset="0" stopColor="#12465b" stopOpacity=".78" />
          <stop offset=".58" stopColor="#082b3c" stopOpacity=".76" />
          <stop offset="1" stopColor="#03131d" stopOpacity=".15" />
        </radialGradient>
        <linearGradient id="gateway-land" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#46a3b5" />
          <stop offset=".42" stopColor="#27758d" />
          <stop offset="1" stopColor="#10445d" />
        </linearGradient>
        <linearGradient id="gateway-route" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#57e3d0" stopOpacity=".12" />
          <stop offset=".48" stopColor="#8bf8ef" stopOpacity=".95" />
          <stop offset="1" stopColor="#e3ca72" stopOpacity=".18" />
        </linearGradient>
        <pattern id="gateway-grid" width="42" height="42" patternUnits="userSpaceOnUse">
          <path d="M42 0H0V42" fill="none" stroke="#62d9e7" strokeOpacity=".085" strokeWidth="1" />
        </pattern>
        <filter id="gateway-land-depth" x="-12%" y="-12%" width="124%" height="124%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".018 .045" numOctaves="3" seed="17" result="terrain" />
          <feColorMatrix in="terrain" type="saturate" values="0" result="terrain-gray" />
          <feComponentTransfer in="terrain-gray" result="terrain-contrast">
            <feFuncR type="gamma" amplitude="1.25" exponent="1.6" offset="-.12" />
            <feFuncG type="gamma" amplitude="1.25" exponent="1.6" offset="-.12" />
            <feFuncB type="gamma" amplitude="1.25" exponent="1.6" offset="-.12" />
            <feFuncA type="table" tableValues="0 .72" />
          </feComponentTransfer>
          <feComposite in="terrain-contrast" in2="SourceAlpha" operator="in" result="terrain-clipped" />
          <feBlend in="SourceGraphic" in2="terrain-clipped" mode="soft-light" result="textured-land" />
          <feDropShadow in="SourceAlpha" dx="0" dy="3" stdDeviation="4" floodColor="#07131b" floodOpacity=".82" result="coast-shadow" />
          <feMerge><feMergeNode in="coast-shadow" /><feMergeNode in="textured-land" /></feMerge>
        </filter>
        <filter id="gateway-hub-glow" x="-300%" y="-300%" width="700%" height="700%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <rect className="gateway-world-map__ocean" width="1010" height="666" fill="url(#gateway-ocean)" />
      <g className="gateway-world-map__graticule">
        <rect width="1010" height="666" fill="url(#gateway-grid)" />
        <path d="M20 150Q505 205 990 150" />
        <path d="M20 270Q505 300 990 270" />
        <path d="M20 390Q505 360 990 390" />
        <path d="M20 510Q505 455 990 510" />
        <path d="M180 18Q285 333 180 648" />
        <path d="M340 18Q405 333 340 648" />
        <path d="M505 18V648" />
        <path d="M670 18Q605 333 670 648" />
        <path d="M830 18Q725 333 830 648" />
      </g>

      <g className="gateway-world-map__countries" filter="url(#gateway-land-depth)">
        {(world.locations as WorldLocation[]).map((location) => (
          <path
            key={location.id}
            d={location.path}
            data-country={location.id}
            data-active={activityByCountry.has(location.id.toUpperCase()) || undefined}
          >
            <title>{location.name}</title>
          </path>
        ))}
      </g>

      <g className="gateway-world-map__activity" filter="url(#gateway-hub-glow)">
        {activity.map((location) => {
          const center = countryCenters.get(location.countryCode);
          if (!center) return null;
          const radius = Math.min(16, 5 + Math.log2(location.activeUsers + 1) * 3);
          return (
            <g
              key={location.countryCode}
              transform={`translate(${center.x} ${center.y})`}
              tabIndex={0}
              role="button"
              aria-label={`${locale === "ar" ? location.countryName.ar : location.countryName.en}: ${location.activeUsers}`}
              onFocus={() => setFocusedCountry(location.countryCode)}
              onBlur={() => setFocusedCountry(null)}
              onMouseEnter={() => setFocusedCountry(location.countryCode)}
              onMouseLeave={() => setFocusedCountry(null)}
            >
              <circle className="gateway-world-map__activity-pulse" r={radius + 8} />
              <circle className="gateway-world-map__activity-ring" r={radius} />
              <circle className="gateway-world-map__activity-core" r={Math.max(3, radius * .34)} />
              <title>{`${locale === "ar" ? location.countryName.ar : location.countryName.en}: ${location.activeUsers}`}</title>
            </g>
          );
        })}
      </g>

      {focused && focusedCenter ? (
        <g className="gateway-world-map__tooltip" transform={`translate(${Math.min(910, Math.max(100, focusedCenter.x))} ${Math.max(92, focusedCenter.y - 28)})`}>
          <rect x="-92" y="-62" width="184" height="48" />
          <text y="-42" textAnchor="middle">{locale === "ar" ? focused.countryName.ar : focused.countryName.en}</text>
          <text className="gateway-world-map__tooltip-count" y="-25" textAnchor="middle">{locale === "ar" ? `${focused.activeUsers} مستخدم نشط` : `${focused.activeUsers} active users`}</text>
        </g>
      ) : null}

      <g className="gateway-world-map__scan">
        <path d="M24 333H986" />
      </g>
      <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noreferrer">
        <text className="gateway-world-map__credit" x="34" y="48">MAP © SVG MAPS · CC BY 4.0</text>
      </a>
    </svg>
  );
}
