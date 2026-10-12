"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { scenes, type SceneId } from "@/components/home/cinematic-scenes";
import { Icon } from "@/components/ui/icons";
import type { PlatformModuleDefinition } from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

const SLIDE_MS = 7000; // static panels, one service every 7 s
const TICK_MS = 100;

interface SlideCopy {
  accent: string;
  rgb: string;
  headline: readonly [ar: [string, string], en: [string, string]];
  sub: readonly [string, string];
  cta: readonly [string, string];
}

const SLIDES: Record<SceneId, SlideCopy> = {
  projects: {
    accent: "#1fe7ff",
    rgb: "31,231,255",
    headline: [["من الفكرة إلى", "مشروع أقوى"], ["From idea to a", "stronger project"]],
    sub: ["حلّل فكرتك.. قيّمها.. وابدأ التنفيذ بثقة", "Analyze it, evaluate it, and launch with confidence"],
    cta: ["ابدأ مشروعك الآن", "Start your project"],
  },
  academy: {
    accent: "#3aa8ff",
    rgb: "58,168,255",
    headline: [["تعلّم اليوم..", "واصنع فرص الغد"], ["Learn today..", "build tomorrow's chances"]],
    sub: ["دورات، أبحاث، دراسات، ندوات، ومسارات تعليمية", "Courses, research, studies, webinars, and learning paths"],
    cta: ["اكتشف الأكاديمية", "Discover the Academy"],
  },
  talent: {
    accent: "#16e6c4",
    rgb: "22,230,196",
    headline: [["وظّف بذكاء", "أو اعثر على فرصتك"], ["Hire smart", "or find your opportunity"]],
    sub: ["حلول توظيف ذكية لأصحاب الأعمال والباحثين عن العمل", "Smart hiring for employers and job seekers"],
    cta: ["ادخل إلى التوظيف", "Enter Talent"],
  },
  market: {
    accent: "#f5c542",
    rgb: "245,197,66",
    headline: [["اكتشف الفرص", "التي تبحث عنها"], ["Discover the", "opportunities you seek"]],
    sub: ["بيئة ذكية لعرض وطلب الفرص والمشاريع", "A smart space to offer and request opportunities"],
    cta: ["استكشف السوق", "Explore the Market"],
  },
  software: {
    accent: "#4d8dff",
    rgb: "77,141,255",
    headline: [["أدر أعمالك", "بذكاء"], ["Run your", "business smartly"]],
    sub: ["أنظمة متكاملة تساعدك على النمو", "Integrated systems that help you grow"],
    cta: ["استكشف برمجيات جنان", "Explore Jenan Software"],
  },
  programs: {
    accent: "#4df6a2",
    rgb: "77,246,162",
    headline: [["صمّم وأنجز", "في مكان واحد"], ["Design and deliver", "in one place"]],
    sub: ["أدوات احترافية لتسهيل أعمالك اليومية", "Professional tools for your daily work"],
    cta: ["استعرض الأدوات", "Browse the tools"],
  },
};

const ORDER: SceneId[] = ["projects", "academy", "talent", "market", "software", "programs"];

export function CinematicServices({
  locale,
  modules,
}: {
  locale: Locale;
  modules: readonly PlatformModuleDefinition[];
}) {
  const ar = locale === "ar";
  const items = ORDER.map((id) => modules.find((module) => module.id === id)).filter(
    (module): module is PlatformModuleDefinition => Boolean(module),
  );
  const count = items.length;
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const elapsed = useRef(0);
  const paused = useRef(false);
  const [reduced, setReduced] = useState(false);

  const goTo = useCallback(
    (next: number) => {
      indexRef.current = next;
      elapsed.current = 0;
      setIndex(next);
    },
    [],
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduced || count < 2) return;
    const timer = window.setInterval(() => {
      if (paused.current || document.hidden) return;
      elapsed.current += TICK_MS;
      if (elapsed.current >= SLIDE_MS) goTo((indexRef.current + 1) % count);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [reduced, count, goTo]);

  function hold(value: boolean) {
    paused.current = value;
  }

  if (!count) return null;

  return (
    <section
      className="cine"
      aria-roledescription="carousel"
      aria-label={ar ? "خدمات المنصة" : "Platform services"}
      onMouseEnter={() => hold(true)}
      onMouseLeave={() => hold(false)}
      onFocus={() => hold(true)}
      onBlur={() => hold(false)}
    >
      <div className="cine__slides">
        {items.map((module, i) => {
          const id = module.id as SceneId;
          const copy = SLIDES[id];
          const Scene = scenes[id];
          const state = i === index ? "active" : "idle";
          const [l1, l2] = ar ? copy.headline[0] : copy.headline[1];
          return (
            <article
              key={id}
              className="cine__slide"
              data-state={state}
              data-scene={id}
              aria-hidden={state === "idle" ? true : undefined}
              style={{ "--ac": copy.accent, "--ac-rgb": copy.rgb } as CSSProperties}
            >
              <div className="cine__scene" aria-hidden="true">
                <Scene />
              </div>
              <div className="cine__body">
                <h2>
                  <span>{l1}</span> <em>{l2}</em>
                </h2>
                <p>{copy.sub[ar ? 0 : 1]}</p>
                <div className="cine__chips">
                  {module.services.slice(0, 4).map((service) => (
                    <Link href={service.href} key={service.id} tabIndex={state === "active" ? 0 : -1}>
                      <Icon name={service.icon} />
                      <span>{service.title[ar ? 0 : 1]}</span>
                    </Link>
                  ))}
                </div>
                <div className="cine__foot">
                  <Link className="cine__cta" href={module.route} tabIndex={state === "active" ? 0 : -1}>
                    <span>{copy.cta[ar ? 0 : 1]}</span>
                    <i><Icon name="arrow" /></i>
                  </Link>
                  <div className="cine__dots" aria-hidden="true">
                    {items.map((other, dot) => (
                      <b key={other.id} data-on={dot === i ? "true" : undefined} />
                    ))}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
