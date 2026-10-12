import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/ui/icons";

/** Code-generated cinematic scenes: layered parallax, floating glass, drawn charts. No photos. */

function Pop({
  x,
  y,
  d = 0,
  w,
  h,
  children,
  className = "",
}: {
  x: number | string;
  y: number | string;
  d?: number;
  w?: number;
  h?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`sc-pop ${className}`}
      style={{ left: x, top: y, width: w, height: h, "--d": `${d}ms` } as CSSProperties}
    >
      <div className="sc-fl" style={{ "--fd": `${(d % 7) * -0.6}s` } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}

function Backdrop({ children }: { children?: ReactNode }) {
  return (
    <>
      <div className="sc-sky" />
      <div className="sc-cam">
        <div className="sc-city" />
        {children}
      </div>
    </>
  );
}

function Bars({ n, heights }: { n: number; heights: number[] }) {
  return (
    <div className="sc-bars">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{ "--h": `${heights[i % heights.length]}%`, "--i": i } as CSSProperties} />
      ))}
    </div>
  );
}

function Glass({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`sc-glass ${className}`}>
      {title ? <b>{title}</b> : null}
      {children}
    </div>
  );
}

const ProjectsScene = () => (
  <Backdrop>
    <Pop x="6%" y="30%" d={400} w={120} h={110}>
      <div className="sc-model">
        <i /><i /><i /><i />
      </div>
    </Pop>
    <Pop x="40%" y="14%" d={700} w={210} h={118}>
      <Glass className="sc-chart">
        <Bars n={9} heights={[32, 48, 40, 62, 55, 74, 68, 88, 96]} />
        <svg viewBox="0 0 200 60" preserveAspectRatio="none">
          <path className="sc-draw" pathLength={1} d="M2 52 L28 44 L52 48 L80 30 L108 34 L138 18 L166 22 L198 6" />
        </svg>
      </Glass>
    </Pop>
  </Backdrop>
);

const AcademyScene = () => (
  <Backdrop>
    <Pop x="30%" y="8%" d={400} w={190} h={120}>
      <svg className="sc-cap" viewBox="0 0 190 120">
        <path d="M95 14 L178 50 L95 86 L12 50 Z" />
        <path d="M44 66 V92 C70 110 120 110 146 92 V66" />
        <path className="sc-tassel" d="M170 54 V96" />
        <circle cx="170" cy="100" r="5" />
      </svg>
    </Pop>
    <Pop x="58%" y="18%" d={1100} w={150} h={96}>
      <Glass title="Jenan Academy" className="sc-screen">
        <i /><i /><i />
        <span className="sc-play"><Icon name="arrow" /></span>
      </Glass>
    </Pop>
  </Backdrop>
);

const TalentScene = () => (
  <Backdrop>
    {[0, 1, 2].map((i) => (
      <Pop key={i} x={`${4 + i * 22}%`} y={`${14 + (i === 1 ? -4 : 6)}%`} d={400 + i * 260} w={112} h={132}>
        <Glass className="sc-profile">
          <span className="sc-avatar" />
          <i /><i />
          <em><Icon name="check" /></em>
        </Glass>
      </Pop>
    ))}
    <Pop x="72%" y="18%" d={1400} w={92} h={92}>
      <div className="sc-scan"><Icon name="search" /></div>
    </Pop>
  </Backdrop>
);

const MarketScene = () => (
  <Backdrop>
    <Pop x="12%" y="20%" d={400} w={190} h={140}>
      <div className="sc-shop">
        <div className="sc-awning" />
        <div className="sc-windows"><i /><i /><i /></div>
        <div className="sc-door" />
      </div>
    </Pop>
    <Pop x="52%" y="16%" d={900} w={92} h={92}>
      <Glass className="sc-cart"><Icon name="cart" /></Glass>
    </Pop>
  </Backdrop>
);

const SoftwareScene = () => (
  <Backdrop>
    <Pop x="12%" y="12%" d={400} w={290} h={150}>
      <Glass className="sc-dash">
        <Bars n={12} heights={[40, 56, 48, 70, 62, 80, 58, 90, 72, 84, 66, 96]} />
        <svg viewBox="0 0 280 40" preserveAspectRatio="none">
          <path className="sc-draw" pathLength={1} d="M2 32 L34 24 L66 28 L100 14 L134 18 L170 8 L210 14 L278 3" />
        </svg>
      </Glass>
    </Pop>
    <Pop x="66%" y="16%" d={900} w={96} h={96}>
      <svg className="sc-ring" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="38" />
        <circle className="sc-ring-fg" cx="50" cy="50" r="38" pathLength={1} />
      </svg>
    </Pop>
  </Backdrop>
);

const tiles = [
  { t: "PDF", c: "#ff5468", x: "20%", y: "10%", d: 400 },
  { t: "IMG", c: "#2fd6ff", x: "38%", y: "52%", d: 700 },
  { t: "XLS", c: "#2fd16d", x: "56%", y: "12%", d: 1000 },
  { t: "DOC", c: "#3a86ff", x: "72%", y: "50%", d: 1300 },
  { t: "ABC", c: "#a56bff", x: "9%", y: "54%", d: 1600 },
];

const ProgramsScene = () => (
  <Backdrop>
    {tiles.map((tile) => (
      <Pop key={tile.t} x={tile.x} y={tile.y} d={tile.d} w={84} h={84}>
        <div className="sc-tile" style={{ "--tc": tile.c } as CSSProperties}>
          <b>{tile.t}</b>
        </div>
      </Pop>
    ))}
  </Backdrop>
);

export const scenes = {
  projects: ProjectsScene,
  academy: AcademyScene,
  talent: TalentScene,
  market: MarketScene,
  software: SoftwareScene,
  programs: ProgramsScene,
} as const;

export type SceneId = keyof typeof scenes;
