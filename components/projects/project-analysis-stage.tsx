"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { flowText, type FlowCopy } from "@/components/projects/project-flow-kit";
import { Icon, type IconName } from "@/components/ui/icons";

const ProjectMapBackdrop = dynamic(
  () => import("@/components/projects/project-map-backdrop").then((module) => module.ProjectMapBackdrop),
  { ssr: false },
);

export const ANALYSIS_CENTER = { latitude: 24.8216, longitude: 46.6633 };

const CALLOUTS: ReadonlyArray<{ icon: IconName; label: FlowCopy; spot: string }> = [
  { icon: "people", label: ["عدد السكان", "Population"], spot: "a" },
  { icon: "car", label: ["حركة المرور", "Traffic"], spot: "b" },
  { icon: "store", label: ["المنافسون", "Competitors"], spot: "c" },
  { icon: "trend", label: ["الطلب المتوقع", "Expected demand"], spot: "d" },
  { icon: "wallet", label: ["القوة الشرائية", "Purchasing power"], spot: "e" },
  { icon: "target", label: ["فرصة السوق", "Market opportunity"], spot: "f" },
];

const FEATURES: ReadonlyArray<{ icon: IconName; label: FlowCopy }> = [
  { icon: "target", label: ["تحليل موثق بمصادره", "Sourced analysis"] },
  { icon: "bolt", label: ["مؤشرات من مصادر معلنة", "Disclosed-source indicators"] },
  { icon: "database", label: ["مؤشرات شاملة للسوق", "Broad market indicators"] },
  { icon: "settings", label: ["حسابات حتمية قابلة للمراجعة", "Deterministic, reviewable"] },
];

/** The analysis landing scene: a night map of the city, the title block, and the callouts around the pin. */
export function AnalysisStage({
  ar,
  extra,
  onStart,
  reportHref,
  testId,
}: {
  ar: boolean;
  extra?: ReactNode;
  onStart?: () => void;
  /** Set only when the user already has a finished report; without it the page offers just «ابدأ التحليل». */
  reportHref?: string;
  testId?: string;
}) {
  // The city map only decorates the page, so it loads after the page itself has finished loading.
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      timer = window.setTimeout(() => setMapReady(true), 600);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      window.removeEventListener("load", arm);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <section className="an-stage" data-testid={testId}>
      <div aria-hidden="true" className="an-backdrop">
        {mapReady ? <ProjectMapBackdrop latitude={ANALYSIS_CENTER.latitude} longitude={ANALYSIS_CENTER.longitude} zoom={14} /> : null}
      </div>

      <div className="an-canvas">
        <div className="an-copy">
          <nav aria-label={ar ? "مسار الصفحة" : "Breadcrumb"} className="an-crumbs">
            <Link href="/projects">{ar ? "المشاريع والاستثمار" : "Projects and investment"}</Link>
            <Icon name="chevron" />
            <span>{ar ? "تحليل المشاريع" : "Project analysis"}</span>
          </nav>
          <h1>{ar ? <>تحليل مشروع <b>ذكي</b></> : <>Smart project <b>analysis</b></>}</h1>
          <p>
            {ar ? (
              <>
                <span>حلّل فكرة مشروعك والسوق المستهدف</span> <span>والمنافسين والموقع الجغرافي ببيانات</span> <span>واقعية من مصادر معلنة وموثقة.</span>
              </>
            ) : (
              <>
                <span>Analyze your project idea and target market,</span> <span>competitors and location with real data</span> <span>from disclosed, reviewable sources.</span>
              </>
            )}
          </p>
          <div className={`an-actions${reportHref ? "" : " is-single"}`}>
            {onStart ? (
              <button className="an-start" data-testid="analysis-start" onClick={onStart} type="button"><Icon name="barChart" />{ar ? "ابدأ التحليل" : "Start analysis"}<Icon name="arrow" /></button>
            ) : (
              <Link className="an-start" data-testid="analysis-start" href="/projects/analysis"><Icon name="barChart" />{ar ? "ابدأ التحليل" : "Start analysis"}<Icon name="arrow" /></Link>
            )}
            {reportHref ? <Link className="an-ghost" href={reportHref}><Icon name="fileText" />{ar ? "عرض التقرير" : "View report"}</Link> : null}
          </div>
          {extra}
          <ul className="an-features">
            {FEATURES.map((feature) => <li key={feature.label[0]}><Icon name={feature.icon} /><span>{flowText(feature.label, ar)}</span></li>)}
          </ul>
        </div>

        <div aria-hidden="true" className="an-hub">
          <svg className="an-hub__lines" preserveAspectRatio="none" viewBox="0 0 100 100">
            <path d="M50 50 22 15M50 50 80 18M50 50 18 50M50 50 84 52M50 50 24 84M50 50 78 84" />
          </svg>
          <svg className="an-hub__lines is-canvas" viewBox="0 0 1672 941">
            <path d="M1133 485 937 376M1133 485 1291 389M1133 485 879 500M1133 485 1384 503M1133 485 966 626M1133 485 1310 625" />
          </svg>
          <i className="an-hub__zone" />
          <span className="an-hub__pin"><Icon name="mapPin" /></span>
          {CALLOUTS.map((item) => (
            <article className={`an-callout is-${item.spot}`} key={item.spot}>
              <span><Icon name={item.icon} /></span>
              <div><small>{flowText(item.label, ar)}</small><b>{ar ? "يظهر بعد التحليل" : "Shown after analysis"}</b></div>
              <em />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
