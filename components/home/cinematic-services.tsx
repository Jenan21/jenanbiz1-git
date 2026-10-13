"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
} from "react";
import {
  BRAND_LEAF_SRC,
  CTA_ROCKET_SRC,
  SERVICE_PANELS,
  iconSrc,
  sceneSrc,
  splitHeadline,
} from "@/components/home/service-panels";
import type { Locale } from "@/types/i18n";

const SLIDE_MS = 3000; // one service every 3 s
const TICK_MS = 100;
const TOUCH_HOLD_MS = 10_000;

type Hold = "hover" | "focus";

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

export function CinematicServices({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const l = ar ? 0 : 1;
  const dir = ar ? "rtl" : "ltr";
  const count = SERVICE_PANELS.length;
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [reduced, setReduced] = useState(false);
  const indexRef = useRef(0);
  const elapsed = useRef(0);
  const holds = useRef(new Set<Hold>());
  const touchUntil = useRef(0);

  const goTo = useCallback((next: number) => {
    indexRef.current = next;
    elapsed.current = 0;
    setIndex(next);
  }, []);

  const hold = useCallback((reason: Hold, on: boolean) => {
    if (on) holds.current.add(reason);
    else holds.current.delete(reason);
    setHeld(holds.current.size > 0);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => {
      if (holds.current.size > 0 || document.hidden || performance.now() < touchUntil.current) return;
      elapsed.current += TICK_MS;
      if (elapsed.current >= SLIDE_MS) goTo((indexRef.current + 1) % count);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [reduced, count, goTo]);

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "touch") hold("hover", true);
  };
  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "touch") hold("hover", false);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch") touchUntil.current = performance.now() + TOUCH_HOLD_MS;
  };
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    if (event.target.matches(":focus-visible")) hold("focus", true);
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) hold("focus", false);
  };

  return (
    <section
      className="cine"
      data-locale={locale}
      aria-roledescription="carousel"
      aria-label={ar ? "خدمات المنصة" : "Platform services"}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="cine__brand" aria-hidden="true">
        <span className="cine__leaf">
          <Image src={BRAND_LEAF_SRC} alt="" fill sizes="26px" unoptimized loading="eager" draggable={false} />
        </span>
        <span className="cine__wordmark">
          <b>
            Jenan <em>Pro</em>
          </b>
          <small>جنان برو</small>
        </span>
      </div>

      <div className="cine__slides" aria-live={held || reduced ? "polite" : "off"}>
        {SERVICE_PANELS.map((panel, i) => {
          const active = i === index;
          const marketing = panel.variant === "marketing";
          return (
            <article
              key={panel.id}
              className="cine__slide"
              data-panel={panel.id}
              data-state={active ? "active" : "idle"}
              data-variant={panel.variant}
              data-underline={panel.underline}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${count} — ${panel.name[l]}`}
              aria-hidden={active ? undefined : true}
              inert={!active}
            >
              <div className="cine__scene" aria-hidden="true">
                <Image
                  src={sceneSrc(panel.id)}
                  alt=""
                  fill
                  sizes="526px"
                  unoptimized
                  loading="eager"
                  draggable={false}
                />
              </div>

              <div className="cine__text">
                <h2 className="cine__title" dir={dir}>
                  {splitHeadline(panel.headline[l]).map((part, partIndex) =>
                    part.accent ? <em key={partIndex}>{part.text}</em> : <span key={partIndex}>{part.text}</span>,
                  )}
                </h2>
                <p className="cine__sub" dir={dir}>
                  {panel.sub[l]}
                </p>
                <div className="cine__row">
                  <Link className="cine__cta" href={panel.cta.href} prefetch={false}>
                    {marketing ? (
                      <i className="cine__cta-lead" aria-hidden="true">
                        <span>
                          <Image src={CTA_ROCKET_SRC} alt="" fill sizes="24px" unoptimized loading="eager" draggable={false} />
                        </span>
                      </i>
                    ) : null}
                    <span className="cine__cta-text" dir={dir}>
                      <b>{panel.cta.label[l]}</b>
                      {panel.cta.note ? <small>{panel.cta.note[l]}</small> : null}
                    </span>
                    <i className="cine__cta-knob" aria-hidden="true">
                      {marketing ? <Arrow /> : <Chevron />}
                    </i>
                  </Link>
                  <ul className="cine__tiles" dir={dir}>
                    {panel.tiles.map((tile, tileIndex) => (
                      <li key={tile.href + tileIndex}>
                        <Link className="cine__tile" href={tile.href} prefetch={false} dir={dir}>
                          <span className="cine__icon" aria-hidden="true">
                            <Image
                              src={iconSrc(panel.id, (tileIndex + 1) as 1 | 2 | 3 | 4)}
                              alt=""
                              fill
                              sizes="48px"
                              unoptimized
                              loading="eager"
                              draggable={false}
                            />
                          </span>
                          <b>{tile.label[l]}</b>
                          {tile.note ? <small>{tile.note[l]}</small> : null}
                          <u aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="cine__dots" role="group" aria-label={ar ? "اختيار الخدمة" : "Choose a service"}>
        {SERVICE_PANELS.map((panel, i) => (
          <button
            key={panel.id}
            type="button"
            className="cine__dot"
            data-on={i === index ? "" : undefined}
            aria-label={`${panel.name[l]} (${i + 1}/${count})`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => goTo(i)}
          >
            <i aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
