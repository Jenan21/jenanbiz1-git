import type { Locale } from "@/types/i18n";

/** The photograph is drawn by the stylesheet (public/assets/home-hero.webp); this overlay adds the glowing links and labels. */
const LABELS = {
  ar: { ideas: "أفكار", projects: "مشاريع", opportunities: "فرص", growth: "نمو" },
  en: { ideas: "Ideas", projects: "Projects", opportunities: "Opportunities", growth: "Growth" },
} as const;

const WIDTHS = {
  ar: { ideas: 62, projects: 78, opportunities: 60, growth: 56 },
  en: { ideas: 62, projects: 84, opportunities: 116, growth: 76 },
} as const;

const ARCS = [
  "M146 153 C 230 40, 450 -14, 660 57",
  "M485 125 C 540 72, 600 52, 660 57",
  "M660 57 C 712 82, 762 112, 777 165",
  "M660 57 C 740 38, 800 46, 837 74",
  "M777 165 C 838 192, 910 190, 957 212",
  "M437 160 C 520 90, 640 110, 700 150",
];

const DOTS: ReadonlyArray<readonly [number, number]> = [
  [146, 153],
  [485, 125],
  [660, 57],
  [837, 74],
  [957, 212],
  [700, 150],
  [437, 160],
];

function Chip({ x, y, width, label }: { x: number; y: number; width: number; label: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="authenticated-home__chip">
        <rect fill="rgba(5,22,48,.82)" height="30" rx="10" stroke="#2cc6ff" strokeOpacity=".85" strokeWidth="1.2" width={width} x={-width / 2} y="-15" />
        <text dy="5.5" fill="#f2fbff" fontSize="15.5" fontWeight="600" textAnchor="middle">{label}</text>
      </g>
    </g>
  );
}

export function HomeScene({ locale }: { locale: Locale }) {
  const text = LABELS[locale];
  const width = WIDTHS[locale];
  return (
    <div aria-hidden="true" className="authenticated-home__scene">
      <div className="authenticated-home__grade" />
      <svg focusable="false" preserveAspectRatio="xMinYMax slice" viewBox="0 0 1672 369">
        <defs>
          <filter id="ah-glow" height="300%" width="300%" x="-100%" y="-100%">
            <feGaussianBlur result="blur" stdDeviation="3" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g fill="none" filter="url(#ah-glow)" stroke="#33d6ff" strokeLinecap="round" strokeOpacity=".8" strokeWidth="1.6">
          {ARCS.map((path) => <path d={path} key={path} />)}
        </g>
        <path d="M146 130 L146 153 M485 76 L485 125 M957 188 L957 212" fill="none" stroke="#33d6ff" strokeOpacity=".7" strokeWidth="1.4" />
        {DOTS.map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} fill="#9af4ff" filter="url(#ah-glow)" r="4.2" />
            <circle className="authenticated-home__node-ring" cx={x} cy={y} fill="none" r="9" stroke="#33d6ff" strokeOpacity=".7" />
          </g>
        ))}
        <Chip label={text.ideas} width={width.ideas} x={147} y={112} />
        <Chip label={text.projects} width={width.projects} x={496} y={52} />
        <Chip label={text.opportunities} width={width.opportunities} x={691} y={106} />
        <Chip label={text.growth} width={width.growth} x={956} y={172} />
        <g transform="translate(473 176)">
          <g className="authenticated-home__chip">
            <circle fill="rgba(6,46,74,.9)" filter="url(#ah-glow)" r="22" stroke="#2de2f0" strokeWidth="1.6" />
            <path d="M-8 9V-1M0 9V-9M8 9V3" stroke="#2de2f0" strokeLinecap="round" strokeWidth="3.4" />
          </g>
        </g>
        <g transform="translate(777 165)">
          <g className="authenticated-home__chip">
            <circle fill="rgba(6,46,74,.9)" filter="url(#ah-glow)" r="22" stroke="#2de2f0" strokeWidth="1.6" />
            <path d="M0 -10 9 -5v10L0 10-9 5V-5Z M-9 -5 0 0 9 -5 M0 0v10" fill="none" stroke="#2de2f0" strokeLinejoin="round" strokeWidth="1.8" />
          </g>
        </g>
      </svg>
    </div>
  );
}
