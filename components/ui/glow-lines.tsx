/**
 * GlowLines — SVG technical connector lines that originate from
 * market indicator points and extend toward the map/center panel.
 *
 * Renders as a position:absolute overlay; parent must be position:relative.
 */

interface GlowLinesProps {
  /** Width of the SVG viewport (defaults to full parent) */
  width?: number | string;
  /** Height of the SVG viewport */
  height?: number | string;
  /** Unique prefix for SVG defs IDs to avoid duplicate-ID conflicts */
  idPrefix?: string;
  className?: string;
}

/**
 * A set of decorative SVG paths that simulate data-flow lines
 * from the right analytics panel toward the central map area.
 * The coordinates are expressed in a 1000×600 viewBox so they
 * scale proportionally at any container size.
 */
export function GlowLines({
  width = "100%",
  height = "100%",
  idPrefix = "gl",
  className,
}: GlowLinesProps) {
  const fadeRight = `${idPrefix}-fade-right`;
  const fadeLeft = `${idPrefix}-fade-left`;
  const blurGlow = `${idPrefix}-blur-glow`;

  return (
    <svg
      viewBox="0 0 1000 600"
      width={width}
      height={height}
      className={["ds-glow-lines", className].filter(Boolean).join(" ")}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={fadeRight} cx="100%" cy="50%" r="60%">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={fadeLeft} cx="0%" cy="50%" r="60%">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </radialGradient>
        <filter id={blurGlow}>
          <feGaussianBlur stdDeviation="2.5" result="blurred" />
          <feMerge>
            <feMergeNode in="blurred" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Lines from right panel → center ── */}
      {/* Gold indicator line */}
      <path
        className="ds-glow-line ds-glow-line--pulse"
        d="M 940 95 C 820 95, 720 160, 620 200"
        stroke={`url(#${fadeRight})`}
        filter={`url(#${blurGlow})`}
      />
      {/* Silver indicator line */}
      <path
        className="ds-glow-line"
        d="M 940 145 C 800 145, 710 190, 640 230"
        stroke={`url(#${fadeRight})`}
      />
      {/* Bitcoin indicator line */}
      <path
        className="ds-glow-line ds-glow-line--pulse"
        d="M 940 320 C 830 310, 740 280, 660 270"
        stroke={`url(#${fadeRight})`}
        filter={`url(#${blurGlow})`}
      />
      {/* NVDA / stock line */}
      <path
        className="ds-glow-line"
        d="M 940 230 C 860 230, 780 240, 700 255"
        stroke={`url(#${fadeRight})`}
      />
      {/* ETH line */}
      <path
        className="ds-glow-line"
        d="M 940 370 C 870 360, 800 330, 720 310"
        stroke={`url(#${fadeRight})`}
      />

      {/* ── Lines from left panel → center ── */}
      <path
        className="ds-glow-line"
        d="M 60 120 C 180 120, 280 160, 380 190"
        stroke={`url(#${fadeLeft})`}
      />
      <path
        className="ds-glow-line ds-glow-line--pulse"
        d="M 60 200 C 200 200, 300 220, 410 240"
        stroke={`url(#${fadeLeft})`}
        filter={`url(#${blurGlow})`}
      />
      <path
        className="ds-glow-line"
        d="M 60 280 C 190 270, 300 265, 420 260"
        stroke={`url(#${fadeLeft})`}
      />
      <path
        className="ds-glow-line"
        d="M 60 360 C 190 345, 310 310, 440 295"
        stroke={`url(#${fadeLeft})`}
      />

      {/* ── Horizontal grid accent lines through center ── */}
      <line
        className="ds-glow-line ds-glow-line--solid"
        x1="200" y1="215" x2="800" y2="215"
      />
      <line
        className="ds-glow-line ds-glow-line--solid"
        x1="250" y1="280" x2="750" y2="280"
      />
      <line
        className="ds-glow-line ds-glow-line--solid"
        x1="200" y1="345" x2="800" y2="345"
      />

      {/* ── Node dots at connector origins (right side) ── */}
      {[95, 145, 230, 320, 370].map((y) => (
        <circle
          key={y}
          cx={940}
          cy={y}
          r={3}
          fill="var(--brand)"
          opacity={0.6}
          filter={`url(#${blurGlow})`}
        />
      ))}

      {/* ── Node dots at connector origins (left side) ── */}
      {[120, 200, 280, 360].map((y) => (
        <circle
          key={y}
          cx={60}
          cy={y}
          r={3}
          fill="var(--brand)"
          opacity={0.5}
          filter={`url(#${blurGlow})`}
        />
      ))}

      {/* ── Center map intersection halos ── */}
      <circle cx={500} cy={270} r={40} fill="none"
        stroke="var(--brand)" strokeWidth="0.8" opacity="0.15" />
      <circle cx={500} cy={270} r={70} fill="none"
        stroke="var(--brand)" strokeWidth="0.5" opacity="0.08" />
    </svg>
  );
}
