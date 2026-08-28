"use client";

/**
 * ConnectionLines
 * Subtle glowing SVG line motifs that emanate from indicator points and
 * extend behind the map / primary hub area. These are purely decorative
 * and intentionally understated – thin, translucent, and glow-tinted.
 */
export function ConnectionLines({
  className = "",
  animate = true,
}: {
  className?: string;
  animate?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 1200 600"
      aria-hidden="true"
      className={`connection-lines ${className}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        {/* glow filter */}
        <filter id="cl-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* fading gradient along line direction */}
        <linearGradient id="cl-fade-r" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.7" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cl-fade-l" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.7" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cl-fade-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--glow)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--glow)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cl-violet" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--violet)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="var(--violet)" stopOpacity="0" />
        </linearGradient>

        {/* travelling dot animation */}
        {animate && (
          <>
            <marker id="dot-brand" viewBox="0 0 4 4" refX="2" refY="2" markerWidth="4" markerHeight="4">
              <circle cx="2" cy="2" r="2" fill="var(--brand)" />
            </marker>
          </>
        )}
      </defs>

      {/* ── Right-side indicator lines extending leftward behind the map ── */}
      <g filter="url(#cl-glow)" opacity="0.72">
        {/* top right → center */}
        <path
          d="M1180 88 Q1050 88 920 160 Q800 220 680 210"
          fill="none"
          stroke="url(#cl-fade-l)"
          strokeWidth="1.2"
        />
        {/* mid-right → center */}
        <path
          d="M1180 240 Q1060 240 940 230 Q820 222 680 215"
          fill="none"
          stroke="url(#cl-fade-l)"
          strokeWidth="1"
        />
        {/* lower-right → center */}
        <path
          d="M1180 360 Q1040 340 900 300 Q790 270 680 260"
          fill="none"
          stroke="url(#cl-fade-l)"
          strokeWidth="0.9"
        />
        {/* bottom-right diagonal */}
        <path
          d="M1180 480 Q1020 420 860 370 Q760 335 680 310"
          fill="none"
          stroke="url(#cl-violet)"
          strokeWidth="0.8"
        />
      </g>

      {/* ── Left-side lines extending rightward ── */}
      <g filter="url(#cl-glow)" opacity="0.55">
        <path
          d="M20 160 Q160 150 300 165 Q440 178 520 200"
          fill="none"
          stroke="url(#cl-fade-r)"
          strokeWidth="1"
        />
        <path
          d="M20 290 Q170 285 330 275 Q470 265 540 255"
          fill="none"
          stroke="url(#cl-fade-r)"
          strokeWidth="0.8"
        />
        <path
          d="M20 420 Q200 400 380 360 Q490 335 560 310"
          fill="none"
          stroke="url(#cl-fade-r)"
          strokeWidth="0.7"
        />
      </g>

      {/* ── Indicator glow dots — right side ── */}
      <g filter="url(#cl-glow)">
        {[88, 180, 240, 300, 360, 420, 480].map((y, i) => (
          <circle
            key={y}
            cx={1178}
            cy={y}
            r={i % 2 === 0 ? 3 : 2}
            fill="var(--brand)"
            opacity={i % 2 === 0 ? 0.9 : 0.6}
          >
            {animate && (
              <animate
                attributeName="opacity"
                values={i % 2 === 0 ? "0.9;0.4;0.9" : "0.6;0.2;0.6"}
                dur={`${2 + i * 0.4}s`}
                repeatCount="indefinite"
              />
            )}
          </circle>
        ))}
      </g>

      {/* ── Indicator glow dots — left side ── */}
      <g filter="url(#cl-glow)">
        {[160, 220, 290, 360, 420].map((y, i) => (
          <circle
            key={y}
            cx={22}
            cy={y}
            r={2}
            fill="var(--glow)"
            opacity="0.55"
          >
            {animate && (
              <animate
                attributeName="opacity"
                values="0.55;0.18;0.55"
                dur={`${2.5 + i * 0.5}s`}
                repeatCount="indefinite"
              />
            )}
          </circle>
        ))}
      </g>

      {/* ── Horizontal accent lines (very subtle) ── */}
      <g opacity="0.12" stroke="var(--brand)" strokeWidth="0.5">
        <line x1="0" y1="100" x2="1200" y2="100" />
        <line x1="0" y1="300" x2="1200" y2="300" />
        <line x1="0" y1="500" x2="1200" y2="500" />
      </g>

      {/* ── Travelling pulse dots ── */}
      {animate && (
        <g filter="url(#cl-glow)">
          {/* pulse along top-right line */}
          <circle r="2.5" fill="var(--brand)" opacity="0.85">
            <animateMotion
              dur="6s"
              repeatCount="indefinite"
              path="M1180 88 Q1050 88 920 160 Q800 220 680 210"
            />
          </circle>
          {/* pulse along mid line */}
          <circle r="2" fill="var(--glow)" opacity="0.7">
            <animateMotion
              dur="8s"
              repeatCount="indefinite"
              path="M1180 240 Q1060 240 940 230 Q820 222 680 215"
            />
          </circle>
          {/* pulse along left line */}
          <circle r="2" fill="var(--brand)" opacity="0.6">
            <animateMotion
              dur="7s"
              repeatCount="indefinite"
              path="M20 160 Q160 150 300 165 Q440 178 520 200"
            />
          </circle>
        </g>
      )}
    </svg>
  );
}
