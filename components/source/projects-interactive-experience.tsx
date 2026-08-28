"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { Locale } from "@/types/i18n";

type Mode = "analysis" | "feasibility" | "evaluation" | "launch";
type Pair = readonly [string, string];
type Lens = { code: string; title: Pair; note: Pair };

const fieldSets: Record<Mode, readonly Pair[]> = {
  analysis: [
    ["فكرة المشروع", "Project idea"],
    ["القطاع المستهدف", "Target sector"],
    ["السوق الجغرافي", "Geographic market"],
    ["مرحلة المشروع", "Project stage"],
  ],
  feasibility: [
    ["المشروع والقطاع", "Project and sector"],
    ["السوق المستهدف", "Target market"],
    ["حجم التشغيل", "Operating scale"],
    ["الأفق الزمني", "Planning horizon"],
  ],
  evaluation: [
    ["ملخص المشروع", "Project summary"],
    ["مرحلة المشروع", "Project stage"],
    ["السوق والقطاع", "Market and sector"],
    ["أدلة الجاهزية", "Readiness evidence"],
  ],
  launch: [
    ["اسم المشروع", "Project name"],
    ["مالك المشروع", "Project owner"],
    ["الفريق الأولي", "Initial team"],
    ["نقطة الانطلاق", "Starting point"],
  ],
};

const lensSets: Record<Mode, readonly Lens[]> = {
  analysis: [
    {
      code: "IDEA",
      title: ["وضوح الفكرة", "Idea clarity"],
      note: ["المشكلة والحل والقيمة", "Problem, solution, and value"],
    },
    {
      code: "MARKET",
      title: ["منظور السوق", "Market perspective"],
      note: ["الجمهور والبدائل والفرصة", "Audience and opportunity"],
    },
    {
      code: "OPS",
      title: ["قابلية التشغيل", "Operational fit"],
      note: ["الموارد والمسار والجاهزية", "Resources and readiness"],
    },
    {
      code: "RISK",
      title: ["خريطة المخاطر", "Risk map"],
      note: ["العوائق والاعتماديات", "Blockers and dependencies"],
    },
  ],
  feasibility: [
    {
      code: "MARKET",
      title: ["جدوى السوق", "Market viability"],
      note: ["الطلب والحجم والبدائل", "Demand, size, and alternatives"],
    },
    {
      code: "MODEL",
      title: ["نموذج الإيراد", "Revenue model"],
      note: ["مصادر الدخل والتسعير", "Income and pricing"],
    },
    {
      code: "COST",
      title: ["هيكل التكاليف", "Cost structure"],
      note: ["التأسيس والتشغيل", "Setup and operations"],
    },
    {
      code: "DECISION",
      title: ["بوابة القرار", "Decision gateway"],
      note: ["الافتراضات والبدائل", "Assumptions and options"],
    },
  ],
  evaluation: [
    {
      code: "VALUE",
      title: ["قيمة المشروع", "Project value"],
      note: ["الأثر والميزة", "Impact and advantage"],
    },
    {
      code: "FIT",
      title: ["ملاءمة السوق", "Market fit"],
      note: ["الحاجة والتوقيت", "Need and timing"],
    },
    {
      code: "READY",
      title: ["جاهزية التنفيذ", "Delivery readiness"],
      note: ["الفريق والموارد", "Team and resources"],
    },
    {
      code: "RISK",
      title: ["درجة المخاطر", "Risk posture"],
      note: ["العوائق والمرونة", "Blockers and resilience"],
    },
  ],
  launch: [
    {
      code: "SPACE",
      title: ["مساحة المشروع", "Project space"],
      note: ["الهوية والنطاق", "Identity and scope"],
    },
    {
      code: "TEAM",
      title: ["تشكيل الفريق", "Team formation"],
      note: ["الأدوار والمسؤوليات", "Roles and ownership"],
    },
    {
      code: "PLAN",
      title: ["المسار الأول", "First roadmap"],
      note: ["المراحل والمخرجات", "Stages and outcomes"],
    },
    {
      code: "GATE",
      title: ["بوابة الانطلاق", "Launch gateway"],
      note: ["المراجعة والاعتماد", "Review and approval"],
    },
  ],
};

const titles: Record<Mode, Pair> = {
  analysis: ["نواة فهم المشروع", "Project intelligence core"],
  feasibility: ["مصفوفة الجدوى", "Feasibility matrix"],
  evaluation: ["بوصلة التقييم", "Evaluation compass"],
  launch: ["نواة الانطلاق", "Launch core"],
};

function text(pair: Pair, ar: boolean) {
  return pair[ar ? 0 : 1];
}

function InteractiveCore({
  mode,
  progress,
  scores,
}: {
  mode: Mode;
  progress: number;
  scores: readonly number[];
}) {
  const polygon = useMemo(
    () =>
      scores
        .map((score, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / scores.length;
          const radius = (108 * score) / 100;
          return (
            String(180 + Math.cos(angle) * radius) +
            "," +
            String(180 + Math.sin(angle) * radius)
          );
        })
        .join(" "),
    [scores],
  );
  return (
    <svg className="interactive-core" viewBox="0 0 360 360" aria-hidden="true">
      <g className="interactive-core__grid">
        {[54, 88, 122, 156].map((radius) => (
          <circle cx="180" cy="180" r={radius} key={radius} />
        ))}
        <path d="M180 24v312M24 180h312M70 70l220 220M290 70 70 290" />
      </g>
      {mode === "analysis" ? (
        <g className="interactive-core__shape">
          <path d="m180 76 94 54v108l-94 54-94-54V130Z" />
          <path d="m180 76 94 54-94 54-94-54M180 184v108" />
        </g>
      ) : null}
      {mode === "feasibility" ? (
        <g className="interactive-core__shape">
          <path d="M92 250v-54h32v54M142 250v-92h32v92M192 250v-126h32v126M242 250V88h32v162" />
          <path
            className="interactive-core__gold"
            d="m84 210 72-58 58 14 72-92"
          />
        </g>
      ) : null}
      {mode === "evaluation" ? (
        <polygon className="interactive-core__polygon" points={polygon} />
      ) : null}
      {mode === "launch" ? (
        <g
          className="interactive-core__shape interactive-core__rocket"
          style={{ transform: "translateY(" + String(-progress / 8) + "px)" }}
        >
          <path d="M180 70c54 38 68 104 34 164l-34 38-34-38c-34-60-20-126 34-164Z" />
          <circle cx="180" cy="148" r="25" />
          <path d="m146 210-46 38 57 2M214 210l46 38-57 2" />
        </g>
      ) : null}
      <circle
        className="interactive-core__pulse"
        cx="180"
        cy="180"
        r={12 + progress / 5}
      />
    </svg>
  );
}

export function ProjectsInteractiveExperience({
  locale,
  mode,
}: {
  locale: Locale;
  mode: Mode;
}) {
  const ar = locale === "ar";
  const fields = fieldSets[mode];
  const lenses = lensSets[mode];
  const [values, setValues] = useState(() => fields.map(() => ""));
  const [scores, setScores] = useState<readonly number[]>([64, 52, 72, 45, 58]);
  const [openLens, setOpenLens] = useState<number | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const ready = true;
  const completed = values.filter((value) => value.trim().length > 1).length;
  const progress = Math.round((completed / values.length) * 100);
  const style = {
    "--project-progress": String(progress) + "%",
  } as CSSProperties;
  function update(index: number, value: string) {
    setValues((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  }
  function evaluate() {
    setScores(
      [0, 1, 2, 3, 4].map(
        (index) =>
          42 +
          Math.min(
            (values[index % values.length]?.length ?? 0) * 5 + index * 8,
            52,
          ),
      ),
    );
  }
  return (
    <div
      className={
        "projects-interactive-experience projects-interactive-experience--" +
        mode
      }
      data-ready={ready}
      style={style}
    >
      <aside className="interactive-inputs">
        <header>
          <small>{mode.toUpperCase()} INPUTS</small>
          <strong>{ar ? "بيانات المشروع" : "Project data"}</strong>
          <span>{progress}%</span>
        </header>
        <div
          aria-label={
            ar ? "نسبة اكتمال بيانات المشروع" : "Project data completion"
          }
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="interactive-inputs__progress"
          role="progressbar"
        >
          <i />
        </div>
        {fields.map((field, index) => (
          <label key={field[1]}>
            <span>{"0" + String(index + 1)}</span>
            <input
              aria-label={text(field, ar)}
              placeholder={text(field, ar)}
              value={values[index]}
              onChange={(event) => update(index, event.target.value)}
            />
            <i data-complete={values[index].trim().length > 1 || undefined} />
          </label>
        ))}
        <p>
          {ar
            ? "محاكاة محلية — لا تُحفظ البيانات"
            : "Local simulation — data is not saved"}
        </p>
      </aside>
      <div className="interactive-stage">
        <InteractiveCore mode={mode} progress={progress} scores={scores} />
        <div className="interactive-stage__label">
          <small>JENAN / {mode.toUpperCase()} CORE</small>
          <strong>{text(titles[mode], ar)}</strong>
          <span>
            <i />
            {ar ? "محاكاة تجريبية" : "Simulated preview"}
          </span>
        </div>
        {mode === "evaluation" ? (
          <button
            className="interactive-stage__action"
            type="button"
            onClick={evaluate}
          >
            {ar ? "تشغيل التقييم التحليلي" : "Run analytical evaluation"}
          </button>
        ) : null}
      </div>
      <section
        className="interactive-lenses"
        aria-label={ar ? "محاور المشروع" : "Project lenses"}
      >
        {lenses.map((lens, index) => {
          const unlocked = mode !== "launch" || index <= completed;
          return (
            <button
              className="interactive-lens"
              disabled={!unlocked}
              key={lens.code}
              onClick={() => setOpenLens(index)}
              type="button"
            >
              <span className="interactive-lens__orbit">
                <i />
                <b>{"0" + String(index + 1)}</b>
              </span>
              <span>
                <small>{lens.code}</small>
                <strong>{text(lens.title, ar)}</strong>
                <em>{text(lens.note, ar)}</em>
              </span>
              {mode === "launch" ? (
                <mark>
                  {unlocked
                    ? ar
                      ? "مفتوحة"
                      : "Open"
                    : ar
                      ? "مقفلة"
                      : "Locked"}
                </mark>
              ) : null}
            </button>
          );
        })}
      </section>
      <button
        aria-label={
          ar ? "فتح مساعد جنان التجريبي" : "Open simulated Jenan assistant"
        }
        className="projects-ai-trigger"
        type="button"
        onClick={() => setAssistantOpen(true)}
      >
        <span aria-hidden="true">✦</span>
        <small>JENAN AI</small>
      </button>
      {openLens !== null ? (
        <div
          className="project-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lens-title"
        >
          <button
            className="project-modal__backdrop"
            onClick={() => setOpenLens(null)}
            type="button"
            aria-label={ar ? "إغلاق" : "Close"}
          />
          <section>
            <button
              aria-label={ar ? "إغلاق النافذة" : "Close dialog"}
              className="project-modal__close"
              onClick={() => setOpenLens(null)}
              type="button"
            >
              ×
            </button>
            <small>{lenses[openLens].code} / SIMULATED</small>
            <h2 id="lens-title">{text(lenses[openLens].title, ar)}</h2>
            <p>{text(lenses[openLens].note, ar)}</p>
            {mode === "feasibility" ? (
              <div className="project-modal__fields">
                <label>
                  {ar ? "القيمة التقديرية" : "Estimated value"}
                  <input inputMode="decimal" placeholder="—" />
                </label>
                <label>
                  {ar ? "الفترة الزمنية" : "Time horizon"}
                  <input inputMode="numeric" placeholder="—" />
                </label>
                <label>
                  {ar ? "ملاحظة الدراسة" : "Study note"}
                  <textarea rows={3} />
                </label>
              </div>
            ) : (
              <div className="project-modal__readout">
                <span>{ar ? "حالة المحور" : "Lens state"}</span>
                <strong>{progress ? String(progress) + "%" : "—"}</strong>
                <small>
                  {ar
                    ? "مؤشر تجريبي مشتق من اكتمال الحقول"
                    : "Simulated indicator from field completion"}
                </small>
              </div>
            )}
          </section>
        </div>
      ) : null}
      {assistantOpen ? (
        <div
          className="project-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-title"
        >
          <button
            className="project-modal__backdrop"
            onClick={() => setAssistantOpen(false)}
            type="button"
            aria-label={ar ? "إغلاق" : "Close"}
          />
          <section>
            <button
              aria-label={ar ? "إغلاق النافذة" : "Close dialog"}
              className="project-modal__close"
              onClick={() => setAssistantOpen(false)}
              type="button"
            >
              ×
            </button>
            <small>JENAN AI / LOCAL PREVIEW</small>
            <h2 id="ai-title">
              {ar
                ? "توصية استشارية تجريبية"
                : "Simulated advisory recommendation"}
            </h2>
            <p>
              {progress < 50
                ? ar
                  ? "أكمل تعريف المشروع والسوق أولًا حتى تصبح القراءة أوضح."
                  : "Complete the project and market definition first."
                : ar
                  ? "راجع الافتراضات والمخاطر قبل الانتقال للمرحلة التالية."
                  : "Review assumptions and risks before moving forward."}
            </p>
            <div className="project-modal__readout">
              <span>{ar ? "اكتمال السياق" : "Context completeness"}</span>
              <strong>{progress}%</strong>
              <small>
                {ar
                  ? "ليست توصية ذكاء اصطناعي فعلية"
                  : "Not a live AI recommendation"}
              </small>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function ProjectsHubPulse({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  return (
    <div className="projects-hub-pulse">
      <div className="projects-hub-progress">
        <span>{ar ? "تقدم المشروع" : "Project progress"}</span>
        <i>
          <b />
        </i>
        <strong>25%</strong>
        <small>
          {ar ? "مرحلة التحليل — محاكاة" : "Analysis stage — simulated"}
        </small>
      </div>
      <div className="projects-hub-market">
        <mark>{ar ? "محاكاة" : "SIMULATED"}</mark>
        {["BTC/USD", "XAU/USD", "WTI", "TASI"].map((market, index) => (
          <span key={market}>
            <strong>{market}</strong>
            <em>{["—", "+0.24%", "—", "+0.11%"][index]}</em>
          </span>
        ))}
      </div>
    </div>
  );
}
