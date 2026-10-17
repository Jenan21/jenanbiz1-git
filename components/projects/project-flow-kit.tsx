"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icons";

export type FlowCopy = readonly [string, string];

export const flowText = (value: FlowCopy, ar: boolean) => (ar ? value[0] : value[1]);

/** A popup rectangle in reference pixels of the 1672x941 approved images (see project-canvas.css). */
export type FlowFrame = { h: number; w: number; x: number; y: number };

/** The one dialog shell of every popup flow: backdrop, focus, Escape and the close button. */
export function FlowModal({
  ar,
  children,
  className = "",
  closable = true,
  frame,
  onClose,
  size = "default",
  step,
}: {
  ar: boolean;
  children: ReactNode;
  className?: string;
  closable?: boolean;
  frame?: FlowFrame;
  onClose: () => void;
  size?: "default" | "wide" | "status" | "large";
  step: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!closable) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closable, onClose]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [step]);

  return (
    <div className="pa-modal-layer" onMouseDown={(event) => { if (closable && event.target === event.currentTarget) onClose(); }}>
      <div
        aria-labelledby="pa-modal-title"
        aria-modal="true"
        className={`pa-modal${size === "wide" ? " is-wide" : ""}${size === "status" ? " is-status" : ""}${size === "large" ? " is-large" : ""}${frame ? " cv-frame" : ""}${className ? ` ${className}` : ""}`}
        data-step={step}
        ref={dialogRef}
        role="dialog"
        style={frame ? ({ "--fx": frame.x, "--fy": frame.y, "--fw": frame.w, "--fh": frame.h } as CSSProperties) : undefined}
        tabIndex={-1}
      >
        {closable ? (
          <button aria-label={ar ? "إغلاق" : "Close"} className="pa-modal__close" onClick={onClose} type="button"><Icon name="x" /></button>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** `current` is the zero-based active step; every earlier step is shown as done, and all of them when `complete`. */
export function FlowStepper({
  ar,
  complete = false,
  current,
  label,
  steps,
}: {
  ar: boolean;
  complete?: boolean;
  current: number;
  label: string;
  steps: readonly FlowCopy[];
}) {
  return (
    <ol className="pa-steps" aria-label={label}>
      {steps.map((step, index) => {
        const done = complete || index < current;
        return (
          <li className={done ? "is-done" : index === current ? "is-current" : undefined} key={step[0]}>
            <span>{done ? <Icon name="check" /> : index + 1}</span>
            <small>{flowText(step, ar)}</small>
          </li>
        );
      })}
    </ol>
  );
}

export function FlowHeading({
  hint,
  icon,
  title,
}: {
  hint?: string;
  icon: IconName;
  title: ReactNode;
}) {
  return (
    <header>
      <span className="pa-modal__badge"><Icon name={icon} /></span>
      <div><h2 id="pa-modal-title">{title}</h2>{hint ? <p>{hint}</p> : null}</div>
    </header>
  );
}

export function FlowOrbit({
  icon = "barChart",
  percent,
  state,
}: {
  icon?: IconName;
  percent?: number;
  state: "running" | "done" | "failed";
}) {
  return (
    <div aria-live="polite" className={`pa-orbit is-${state}`} role="status">
      <i /><i />
      {state === "running" && percent !== undefined ? <b className="pa-orbit__percent">{percent}%</b> : <Icon name={state === "done" ? "check" : state === "failed" ? "x" : icon} />}
    </div>
  );
}

export function FlowUnits({
  ar,
  done = false,
  units,
}: {
  ar: boolean;
  done?: boolean;
  units: ReadonlyArray<{ icon: IconName; label: FlowCopy }>;
}) {
  return (
    <ul className={`pa-units${done ? " is-done" : ""}`}>
      {units.map((unit) => (
        <li key={unit.label[0]}>
          <Icon name={unit.icon} /><span>{flowText(unit.label, ar)}</span>
          {done ? <em><Icon name="check" /></em> : null}
        </li>
      ))}
    </ul>
  );
}

/** A small friendly assistant mark drawn in SVG. */
export function RobotMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 120 120">
      <defs>
        <linearGradient id="rb-body" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#f3fbff" /><stop offset="1" stopColor="#9fc7dc" /></linearGradient>
        <radialGradient id="rb-eye"><stop offset="0" stopColor="#7ffcff" /><stop offset="1" stopColor="#0aa3d9" /></radialGradient>
      </defs>
      <line stroke="#7fe9f2" strokeWidth="3" x1="60" x2="60" y1="8" y2="22" />
      <circle cx="60" cy="8" fill="#19f0f6" r="5" />
      <rect fill="url(#rb-body)" height="62" rx="26" width="84" x="18" y="22" />
      <rect fill="#04182c" height="38" rx="18" width="64" x="28" y="32" />
      <circle cx="46" cy="51" fill="url(#rb-eye)" r="8" />
      <circle cx="74" cy="51" fill="url(#rb-eye)" r="8" />
      <path d="M50 64c6 5 14 5 20 0" fill="none" stroke="#19f0f6" strokeLinecap="round" strokeWidth="3" />
      <rect fill="#19f0f6" height="22" rx="6" width="10" x="8" y="42" />
      <rect fill="#19f0f6" height="22" rx="6" width="10" x="102" y="42" />
      <rect fill="url(#rb-body)" height="26" rx="12" width="52" x="34" y="88" />
      <circle cx="60" cy="101" fill="#19f0f6" r="5" />
    </svg>
  );
}

const SKYLINE: ReadonlyArray<[number, number, number]> = [
  [0, 120, 46], [52, 170, 40], [98, 96, 34], [138, 210, 44], [188, 140, 38], [232, 250, 48], [286, 160, 40],
  [332, 118, 36], [374, 200, 46], [426, 150, 40], [472, 230, 50], [528, 128, 38], [572, 184, 44], [622, 104, 36],
];

/** The shared night-city scene behind the flow landing pages: skyline, glowing pins and a map outline, all vector. */
export function FlowScene({ variant }: { variant: "city" | "office" | "desk" }) {
  return (
    <div aria-hidden="true" className={`fx-scene is-${variant}`}>
      <svg className="fx-scene__skyline" preserveAspectRatio="xMaxYMax slice" viewBox="0 0 660 300">
        {SKYLINE.map(([x, h, w], index) => (
          <g key={x}>
            <rect fill="#06182c" height={h} width={w} x={x} y={300 - h} />
            <rect fill="none" height={h} stroke="rgba(25,200,240,0.3)" width={w} x={x} y={300 - h} />
            {Array.from({ length: Math.floor(h / 22) }).map((_, row) => (
              <rect
                fill={(row + index) % 3 === 0 ? "rgba(255,190,110,0.85)" : "rgba(120,210,255,0.5)"}
                height="5"
                key={row}
                width="5"
                x={x + 8 + ((row * 7 + index * 3) % Math.max(1, w - 20))}
                y={300 - h + 10 + row * 20}
              />
            ))}
          </g>
        ))}
      </svg>
      <svg className="fx-scene__map" viewBox="0 0 200 180">
        <path d="M20 40 70 18 112 24 150 54 188 70 176 104 150 112 138 140 102 168 78 150 70 112 42 96 24 70Z" fill="rgba(20,120,190,0.14)" stroke="rgba(25,240,246,0.5)" strokeDasharray="4 3" />
        <circle cx="62" cy="52" fill="#19f0f6" r="4" />
        <circle cx="112" cy="70" fill="#19f0f6" r="4" />
        <circle cx="98" cy="118" fill="#19f0f6" r="4" />
        <path d="M62 52 112 70 98 118" fill="none" stroke="rgba(25,240,246,0.45)" strokeDasharray="3 4" />
      </svg>
      <div className="fx-scene__laptop">
        <span className="fx-scene__screen"><i /><i /><i /><i /></span>
        <span className="fx-scene__base" />
      </div>
      <span className="fx-scene__pin is-a"><Icon name="mapPin" /></span>
      <span className="fx-scene__pin is-b"><Icon name="mapPin" /></span>
      <span className="fx-scene__pin is-c"><Icon name="mapPin" /></span>
      <span className="fx-scene__books"><b /><b /><b /><b /></span>
    </div>
  );
}
