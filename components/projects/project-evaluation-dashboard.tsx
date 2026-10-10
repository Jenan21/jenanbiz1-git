"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];
type AssessmentType =
  | "MARKET"
  | "FINANCIAL"
  | "OPERATIONAL"
  | "RISK"
  | "TECHNICAL"
  | "COMPLIANCE";
type PhaseStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "BLOCKED" | "SKIPPED";
type Assessment = {
  id: string;
  type: AssessmentType;
  score: number | null;
  status: PhaseStatus;
  summary: string | null;
  source: string | null;
  assessedAt: string | null;
};
type EvaluationProject = {
  id: string;
  name: string;
  description: string | null;
  sector: string | null;
  countryCode: string | null;
  currency: string;
  status: string;
  currentPhase: string;
  updatedAt: string;
  phases: Array<{
    id: string;
    type: string;
    title: string;
    sequence: number;
    status: PhaseStatus;
  }>;
  assessments: Assessment[];
  decisions: Array<{
    id: string;
    verdict: "APPROVE" | "REJECT" | "RETURN_FOR_REVIEW";
    weightedScore: number;
    rationale: string;
    createdAt: string;
  }>;
  financialPlans: Array<{ id: string; version: number; createdAt: string }>;
  risks: Array<{
    id: string;
    category: string;
    title: string;
    likelihood: number;
    impact: number;
    score: number;
    status: "OPEN" | "MITIGATING" | "ACCEPTED" | "CLOSED";
    mitigation: string;
    ownerLabel: string;
    reviewAt: string | null;
  }>;
  evidenceFiles: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: string;
    createdAt: string;
  }>;
};
type Quality = {
  score: number;
  completeness: number;
  readyForDecision: boolean;
  verdict: "APPROVE" | "REVIEW" | "REJECT" | "INCOMPLETE";
  missing: AssessmentType[];
};
type RunCommand = (
  body: Record<string, unknown>,
  successMessage: string,
) => Promise<boolean>;

const assessmentDefinitions: ReadonlyArray<{
  type: AssessmentType;
  label: Copy;
  shortLabel: Copy;
  icon: IconName;
  weight: number;
  tone: string;
}> = [
  {
    type: "FINANCIAL",
    label: ["الجدوى المالية", "Financial viability"],
    shortLabel: ["المالية", "Financial"],
    icon: "wallet",
    weight: 25,
    tone: "gold",
  },
  {
    type: "MARKET",
    label: ["جاذبية السوق", "Market attractiveness"],
    shortLabel: ["السوق", "Market"],
    icon: "barChart",
    weight: 25,
    tone: "cyan",
  },
  {
    type: "OPERATIONAL",
    label: ["القدرة التشغيلية", "Operating capability"],
    shortLabel: ["التشغيل", "Operations"],
    icon: "settings",
    weight: 15,
    tone: "mint",
  },
  {
    type: "TECHNICAL",
    label: ["الجاهزية التقنية", "Technical readiness"],
    shortLabel: ["التقنية", "Technical"],
    icon: "grid",
    weight: 10,
    tone: "blue",
  },
  {
    type: "COMPLIANCE",
    label: ["الجاهزية النظامية", "Compliance readiness"],
    shortLabel: ["الامتثال", "Compliance"],
    icon: "shield",
    weight: 10,
    tone: "violet",
  },
  {
    type: "RISK",
    label: ["إدارة المخاطر", "Risk management"],
    shortLabel: ["المخاطر", "Risk"],
    icon: "activity",
    weight: 15,
    tone: "red",
  },
];

const evaluationRoutes = [
  {
    route: "/projects/start/evaluation",
    icon: "dashboard" as const,
    label: ["نظرة عامة", "Overview"] as Copy,
  },
  {
    route: "/projects/start/evaluation/new",
    icon: "briefcase" as const,
    label: ["إدخال البيانات", "Data input"] as Copy,
  },
  {
    route: "/projects/start/evaluation/result",
    icon: "barChart" as const,
    label: ["نتائج التقييم", "Evaluation results"] as Copy,
  },
  {
    route: "/projects/start/evaluation/risks",
    icon: "shield" as const,
    label: ["المخاطر", "Risks"] as Copy,
  },
  {
    route: "/projects/start/evaluation/recommendations",
    icon: "sparkles" as const,
    label: ["التوصيات", "Recommendations"] as Copy,
  },
  {
    route: "/projects/start/evaluation/report",
    icon: "mail" as const,
    label: ["التقرير", "Report"] as Copy,
  },
] as const;

function t(ar: boolean, arabic: string, english: string) {
  return ar ? arabic : english;
}

function pick(copy: Copy, ar: boolean) {
  return t(ar, copy[0], copy[1]);
}

function canonicalEvaluationRoute(route: string) {
  const canonical = route.startsWith("/projects/evaluation")
    ? route.replace("/projects/evaluation", "/projects/start/evaluation")
    : route;
  if (canonical.endsWith("/progress") || canonical.endsWith("/details")) {
    return "/projects/start/evaluation/result";
  }
  return evaluationRoutes.some((item) => item.route === canonical)
    ? canonical
    : "/projects/start/evaluation";
}

function assessmentFor(project: EvaluationProject, type: AssessmentType) {
  return project.assessments.find((assessment) => assessment.type === type);
}

function qualityFor(project: EvaluationProject): Quality {
  const missing = assessmentDefinitions
    .filter(({ type }) => {
      const assessment = assessmentFor(project, type);
      return (
        assessment?.score === null ||
        assessment?.score === undefined ||
        !assessment.summary?.trim() ||
        !assessment.source?.trim()
      );
    })
    .map(({ type }) => type);
  const score = Math.round(
    assessmentDefinitions.reduce((total, definition) => {
      const value = assessmentFor(project, definition.type)?.score ?? 0;
      return total + (value * definition.weight) / 100;
    }, 0),
  );
  const completeness = Math.round(
    ((assessmentDefinitions.length - missing.length) /
      assessmentDefinitions.length) *
      100,
  );
  const verdict =
    missing.length > 0
      ? "INCOMPLETE"
      : score >= 75
        ? "APPROVE"
        : score >= 55
          ? "REVIEW"
          : "REJECT";
  return {
    score,
    completeness,
    readyForDecision: missing.length === 0,
    verdict,
    missing,
  };
}

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return locale === "ar" ? "غير محدد" : "Not set";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function scoreStatus(score: number | null | undefined, ar: boolean) {
  if (score === null || score === undefined)
    return t(ar, "بانتظار التقييم", "Awaiting evaluation");
  if (score >= 80) return t(ar, "قوة واضحة", "Clear strength");
  if (score >= 75) return t(ar, "جاهزية جيدة", "Good readiness");
  if (score >= 55) return t(ar, "يحتاج تحسينًا", "Needs improvement");
  return t(ar, "يتطلب معالجة", "Requires action");
}

function verdictLabel(verdict: Quality["verdict"] | string, ar: boolean) {
  const labels: Record<string, Copy> = {
    APPROVE: ["جاهز مع اعتماد", "Ready for approval"],
    REVIEW: ["جاهز مع تحسينات", "Ready with improvements"],
    REJECT: ["غير جاهز حاليًا", "Not ready yet"],
    INCOMPLETE: ["التقييم غير مكتمل", "Evaluation incomplete"],
    RETURN_FOR_REVIEW: ["إعادة للمراجعة", "Returned for review"],
  };
  return pick(labels[verdict] ?? [verdict, verdict], ar);
}

async function listEvaluationProjects() {
  const response = await fetch("/api/projects?limit=100&offset=0", {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    projects?: EvaluationProject[];
    message?: string;
  } | null;
  if (!response.ok || !payload?.success || !payload.projects) {
    throw new Error(payload?.message ?? "Projects could not be loaded");
  }
  return payload.projects;
}

async function projectCommand(body: Record<string, unknown>) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
  } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message ?? "Project operation failed");
  }
}

function ScoreRing({
  ar,
  label,
  score,
}: {
  ar: boolean;
  label: string;
  score: number | null | undefined;
}) {
  const numericScore = score ?? 0;
  const style = { "--pse-score": numericScore } as CSSProperties;
  return (
    <div
      className={`pse-score-ring${score === null || score === undefined ? " is-empty" : ""}`}
      style={style}
    >
      <span>
        <b>{score ?? "—"}</b>
        <small>{score === null || score === undefined ? "" : "%"}</small>
      </span>
      <i>{label || t(ar, "غير متاح", "Unavailable")}</i>
    </div>
  );
}

function EvaluationHero({
  ar,
  description,
  icon,
  quote,
  title,
}: {
  ar: boolean;
  description: Copy;
  icon: IconName;
  quote: Copy;
  title: Copy;
}) {
  return (
    <header className="pse-hero">
      <div className="pse-hero__copy">
        <Icon name={icon} />
        <div>
          <h1>{pick(title, ar)}</h1>
          <p>{pick(description, ar)}</p>
        </div>
      </div>
      <blockquote>
        <b>”</b>
        <span>{pick(quote, ar)}</span>
      </blockquote>
    </header>
  );
}

function EvaluationSidebar({
  activeRoute,
  ar,
  projectId,
}: {
  activeRoute: string;
  ar: boolean;
  projectId?: string;
}) {
  const query = projectId ? `?project=${projectId}` : "";
  return (
    <aside className="pse-sidebar">
      <strong>
        <Icon name="barChart" />
        {t(ar, "تقييم المشروع", "Project evaluation")}
      </strong>
      <nav aria-label={t(ar, "مسارات تقييم المشروع", "Project evaluation routes")}>
        {evaluationRoutes.map((item) => (
          <Link
            className={activeRoute === item.route ? "is-active" : ""}
            href={`${item.route}${query}`}
            key={item.route}
          >
            <Icon name={item.icon} />
            <span>{pick(item.label, ar)}</span>
          </Link>
        ))}
      </nav>
      <Link className="pse-sidebar__back" href={`/projects/start${query}`}>
        <Icon name="rocket" />
        {t(ar, "متابعة خطة بدء المشروع", "Continue project launch plan")}
      </Link>
    </aside>
  );
}

function MetricCard({
  ar,
  definition,
  score,
}: {
  ar: boolean;
  definition: (typeof assessmentDefinitions)[number];
  score: number | null | undefined;
}) {
  return (
    <article className={`pse-metric tone-${definition.tone}`}>
      <header>
        <Icon name={definition.icon} />
        <h2>{pick(definition.label, ar)}</h2>
      </header>
      <div>
        <b>{score ?? "—"}</b>
        <small>{score === null || score === undefined ? "" : "/100"}</small>
      </div>
      <span>
        <i style={{ width: `${score ?? 0}%` }} />
      </span>
      <strong>{scoreStatus(score, ar)}</strong>
    </article>
  );
}

function RadarChart({
  ar,
  project,
}: {
  ar: boolean;
  project: EvaluationProject;
}) {
  const center = 100;
  const radius = 72;
  const points = assessmentDefinitions.map((definition, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / assessmentDefinitions.length;
    const score = assessmentFor(project, definition.type)?.score ?? 0;
    const valueRadius = (radius * score) / 100;
    return `${center + Math.cos(angle) * valueRadius},${center + Math.sin(angle) * valueRadius}`;
  });
  const axisPoints = assessmentDefinitions.map((_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / assessmentDefinitions.length;
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  });
  return (
    <div className="pse-radar">
      <svg viewBox="0 0 200 200" role="img" aria-label={t(ar, "مخطط محاور التقييم", "Evaluation radar chart")}>
        {[1, 0.75, 0.5, 0.25].map((scale) => (
          <polygon
            className="pse-radar__grid"
            key={scale}
            points={axisPoints
              .map(
                (point) =>
                  `${center + (point.x - center) * scale},${center + (point.y - center) * scale}`,
              )
              .join(" ")}
          />
        ))}
        {axisPoints.map((point, index) => (
          <line
            className="pse-radar__axis"
            key={assessmentDefinitions[index].type}
            x1={center}
            x2={point.x}
            y1={center}
            y2={point.y}
          />
        ))}
        <polygon className="pse-radar__value" points={points.join(" ")} />
        {points.map((point, index) => {
          const [cx, cy] = point.split(",").map(Number);
          return (
            <circle
              className="pse-radar__point"
              cx={cx}
              cy={cy}
              key={assessmentDefinitions[index].type}
              r="3"
            />
          );
        })}
      </svg>
      <div className="pse-radar__legend">
        {assessmentDefinitions.map((definition) => (
          <span key={definition.type}>
            <i />
            {pick(definition.shortLabel, ar)}{" "}
            <b>{assessmentFor(project, definition.type)?.score ?? "—"}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function OverviewScreen({
  ar,
  locale,
  project,
  quality,
}: {
  ar: boolean;
  locale: Locale;
  project: EvaluationProject;
  quality: Quality;
}) {
  const strengths = assessmentDefinitions
    .filter(({ type }) => (assessmentFor(project, type)?.score ?? -1) >= 80)
    .slice(0, 3);
  const challenges = assessmentDefinitions
    .filter(({ type }) => {
      const score = assessmentFor(project, type)?.score;
      return score !== null && score !== undefined && score < 75;
    })
    .sort(
      (left, right) =>
        (assessmentFor(project, left.type)?.score ?? 0) -
        (assessmentFor(project, right.type)?.score ?? 0),
    )
    .slice(0, 3);
  const openHighRisks = project.risks.filter(
    (risk) => risk.score >= 15 && risk.status === "OPEN",
  );
  return (
    <>
      <EvaluationHero
        ar={ar}
        description={[
          "قيّم جاهزية مشروعك وجدواه ومخاطره وقوته التشغيلية لاتخاذ قرار استثماري موثق.",
          "Evaluate project readiness, viability, risks, and operating strength for a documented investment decision.",
        ]}
        icon="barChart"
        quote={["رؤية أوضح لقرار استثماري أنجح", "A clearer view for a stronger investment decision"]}
        title={["تقييم مشروع", "Project evaluation"]}
      />
      <section className="pse-overview-actions">
        <div>
          <h2>{project.name}</h2>
          <p>
            {[project.sector, project.countryCode, project.status]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Link
          className="pse-primary"
          href={`/projects/start/evaluation/${quality.completeness === 100 ? "result" : "new"}?project=${project.id}`}
        >
          {quality.completeness === 100
            ? t(ar, "عرض النتائج", "View results")
            : t(ar, "استكمال التقييم", "Complete evaluation")}
          <Icon name="arrow" />
        </Link>
      </section>
      <section className="pse-overview-score">
        <article>
          <span>{t(ar, "النتيجة الإجمالية", "Overall score")}</span>
          <ScoreRing
            ar={ar}
            label={verdictLabel(quality.verdict, ar)}
            score={quality.readyForDecision ? quality.score : null}
          />
        </article>
        <article>
          <span>{t(ar, "اكتمال بيانات التقييم", "Evaluation completeness")}</span>
          <ScoreRing
            ar={ar}
            label={`${assessmentDefinitions.length - quality.missing.length}/${assessmentDefinitions.length}`}
            score={quality.completeness}
          />
        </article>
        {assessmentDefinitions.slice(0, 4).map((definition) => (
          <MetricCard
            ar={ar}
            definition={definition}
            key={definition.type}
            score={assessmentFor(project, definition.type)?.score}
          />
        ))}
      </section>
      <section className="pse-overview-lower">
        <article className="pse-panel">
          <header>
            <Icon name="activity" />
            <h2>{t(ar, "تحليل شامل لعناصر التقييم", "Evaluation dimensions")}</h2>
          </header>
          <RadarChart ar={ar} project={project} />
        </article>
        <article className="pse-panel pse-summary">
          <header>
            <Icon name="mail" />
            <h2>{t(ar, "ملخص التقييم", "Evaluation summary")}</h2>
            <span className={`is-${quality.verdict.toLowerCase()}`}>
              {verdictLabel(quality.verdict, ar)}
            </span>
          </header>
          <p>
            {quality.readyForDecision
              ? t(
                  ar,
                  `اكتملت المحاور الستة بنتيجة موزونة ${quality.score} من 100. القرار النهائي لا يصبح معتمدًا إلا بعد توثيقه بشريًا واستيفاء الخطة المالية.`,
                  `All six areas are complete with a weighted score of ${quality.score}/100. The final decision is not approved until it is documented by a reviewer and the financial plan is available.`,
                )
              : t(
                  ar,
                  `اكتمل ${assessmentDefinitions.length - quality.missing.length} من ${assessmentDefinitions.length} محاور. لا تعرض المنصة نتيجة نهائية قبل اكتمال الأدلة والمصادر.`,
                  `${assessmentDefinitions.length - quality.missing.length} of ${assessmentDefinitions.length} areas are complete. No final result is shown before evidence and sources are complete.`,
                )}
          </p>
          <dl>
            <div>
              <dt>{t(ar, "آخر تحديث", "Last update")}</dt>
              <dd>{formatDate(project.updatedAt, locale)}</dd>
            </div>
            <div>
              <dt>{t(ar, "قرار موثق", "Recorded decision")}</dt>
              <dd>
                {project.decisions[0]
                  ? verdictLabel(project.decisions[0].verdict, ar)
                  : t(ar, "لم يسجل بعد", "Not recorded")}
              </dd>
            </div>
            <div>
              <dt>{t(ar, "مخاطر عالية مفتوحة", "Open high risks")}</dt>
              <dd>{openHighRisks.length}</dd>
            </div>
          </dl>
        </article>
        <article className="pse-panel pse-signals">
          <header>
            <Icon name="sparkles" />
            <h2>{t(ar, "أبرز الإشارات", "Key signals")}</h2>
          </header>
          <h3>{t(ar, "نقاط القوة", "Strengths")}</h3>
          {strengths.length ? (
            strengths.map((definition) => (
              <span key={definition.type}>
                <Icon name={definition.icon} />
                <b>{pick(definition.label, ar)}</b>
                <small>{assessmentFor(project, definition.type)?.score}/100</small>
              </span>
            ))
          ) : (
            <p>{t(ar, "لا توجد قوة موثقة بدرجة 80 أو أعلى بعد.", "No documented score of 80 or higher yet.")}</p>
          )}
          <h3>{t(ar, "أهم التحديات", "Main challenges")}</h3>
          {challenges.length ? (
            challenges.map((definition) => (
              <span className="is-warning" key={definition.type}>
                <Icon name="activity" />
                <b>{pick(definition.label, ar)}</b>
                <small>{assessmentFor(project, definition.type)?.score}/100</small>
              </span>
            ))
          ) : (
            <p>{t(ar, "لا توجد محاور مكتملة دون 75.", "No completed area is below 75.")}</p>
          )}
        </article>
      </section>
    </>
  );
}

function InputScreen({
  ar,
  busy,
  onMessage,
  onReload,
  project,
  quality,
  run,
}: {
  ar: boolean;
  busy: boolean;
  onMessage: (message: string) => void;
  onReload: () => Promise<void>;
  project: EvaluationProject;
  quality: Quality;
  run: RunCommand;
}) {
  const initialDrafts = useMemo(
    () =>
      Object.fromEntries(
        assessmentDefinitions.map((definition) => {
          const assessment = assessmentFor(project, definition.type);
          return [
            definition.type,
            {
              score:
                assessment?.score === null || assessment?.score === undefined
                  ? ""
                  : String(assessment.score),
              summary: assessment?.summary ?? "",
              source: assessment?.source ?? "",
            },
          ];
        }),
      ) as Record<AssessmentType, { score: string; summary: string; source: string }>,
    [project],
  );
  const [drafts, setDrafts] = useState(initialDrafts);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  function updateDraft(
    type: AssessmentType,
    field: "score" | "summary" | "source",
    value: string,
  ) {
    setDrafts((current) => ({
      ...current,
      [type]: { ...current[type], [field]: value },
    }));
  }

  async function saveAssessment(event: FormEvent<HTMLFormElement>, type: AssessmentType) {
    event.preventDefault();
    const draft = drafts[type];
    await run(
      {
        action: "recordAssessment",
        projectId: project.id,
        type,
        score: Number(draft.score),
        summary: draft.summary,
        source: draft.source,
      },
      t(ar, "تم حفظ محور التقييم ودليله.", "Assessment area and evidence saved."),
    );
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > 10 * 1024 * 1024) {
      event.target.value = "";
      setFile(null);
      onMessage(t(ar, "يجب ألا يتجاوز الملف 10 ميجابايت.", "The file must not exceed 10 MB."));
      return;
    }
    setFile(selected);
  }

  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    onMessage("");
    try {
      const form = new FormData();
      form.set("projectId", project.id);
      form.set("file", file);
      const response = await fetch("/api/files", { method: "POST", body: form });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? t(ar, "تعذر رفع الدليل.", "Evidence upload failed."));
      }
      setFile(null);
      await onReload();
      onMessage(t(ar, "تم حفظ ملف الدليل.", "Evidence file saved."));
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : t(ar, "تعذر رفع الدليل.", "Evidence upload failed."),
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <EvaluationHero
        ar={ar}
        description={[
          "أدخل درجات كل محور مع دليل واضح ومصدر قابل للمراجعة للحصول على تقييم موثوق.",
          "Enter every area score with clear evidence and a reviewable source for a reliable evaluation.",
        ]}
        icon="briefcase"
        quote={["دقة المدخلات أساس جودة القرار", "Accurate inputs create better decisions"]}
        title={["إدخال بيانات التقييم", "Evaluation data input"]}
      />
      <section className="pse-input-progress">
        <ScoreRing
          ar={ar}
          label={`${assessmentDefinitions.length - quality.missing.length}/${assessmentDefinitions.length}`}
          score={quality.completeness}
        />
        <div>
          <h2>{t(ar, "مستوى إكمال البيانات", "Data completion")}</h2>
          <p>
            {t(
              ar,
              "يجب أن يحتوي كل محور على درجة ودليل ومصدر. يتم حفظ كل تعديل في سجل مراجعة.",
              "Every area requires a score, evidence, and source. Each change is stored in the revision history.",
            )}
          </p>
        </div>
        <ol>
          <li className="is-complete">{t(ar, "معلومات المشروع", "Project information")}</li>
          <li className={quality.completeness >= 34 ? "is-complete" : ""}>
            {t(ar, "السوق والمخاطر", "Market and risk")}
          </li>
          <li className={quality.completeness === 100 ? "is-complete" : ""}>
            {t(ar, "المالية والتشغيل", "Finance and operations")}
          </li>
          <li className={quality.completeness === 100 ? "is-complete" : ""}>
            {t(ar, "المراجعة والقرار", "Review and decision")}
          </li>
        </ol>
      </section>
      <section className="pse-project-summary pse-panel">
        <div>
          <Icon name="briefcase" />
          <span>
            <small>{t(ar, "المشروع الحالي", "Current project")}</small>
            <b>{project.name}</b>
          </span>
        </div>
        <dl>
          <div>
            <dt>{t(ar, "القطاع", "Sector")}</dt>
            <dd>{project.sector ?? t(ar, "غير محدد", "Not set")}</dd>
          </div>
          <div>
            <dt>{t(ar, "الدولة", "Country")}</dt>
            <dd>{project.countryCode ?? t(ar, "غير محددة", "Not set")}</dd>
          </div>
          <div>
            <dt>{t(ar, "الوصف", "Description")}</dt>
            <dd>{project.description ?? t(ar, "غير محفوظ", "Not saved")}</dd>
          </div>
        </dl>
        <Link href={`/projects/start/new?project=${project.id}`}>
          {t(ar, "تعديل بيانات المشروع", "Edit project data")}
          <Icon name="arrow" />
        </Link>
      </section>
      <section className="pse-assessment-forms">
        {assessmentDefinitions.map((definition) => {
          const draft = drafts[definition.type];
          const existing = assessmentFor(project, definition.type);
          return (
            <form
              className={`pse-assessment-form tone-${definition.tone}`}
              data-assessment-type={definition.type}
              key={definition.type}
              onSubmit={(event) => void saveAssessment(event, definition.type)}
            >
              <header>
                <Icon name={definition.icon} />
                <div>
                  <h2>{pick(definition.label, ar)}</h2>
                  <small>
                    {t(ar, `الوزن ${definition.weight}%`, `Weight ${definition.weight}%`)}
                  </small>
                </div>
                {existing?.status === "COMPLETED" ? (
                  <span>
                    <Icon name="check" />
                    {t(ar, "محفوظ", "Saved")}
                  </span>
                ) : null}
              </header>
              <label>
                <span>{t(ar, "الدرجة من 100", "Score out of 100")}</span>
                <input
                  max="100"
                  min="0"
                  required
                  type="number"
                  value={draft.score}
                  onChange={(event) =>
                    updateDraft(definition.type, "score", event.target.value)
                  }
                />
              </label>
              <label>
                <span>{t(ar, "الدليل والتحليل", "Evidence and analysis")}</span>
                <textarea
                  maxLength={4000}
                  minLength={3}
                  required
                  rows={3}
                  value={draft.summary}
                  onChange={(event) =>
                    updateDraft(definition.type, "summary", event.target.value)
                  }
                />
              </label>
              <label>
                <span>{t(ar, "المصدر", "Source")}</span>
                <input
                  maxLength={500}
                  minLength={3}
                  required
                  value={draft.source}
                  onChange={(event) =>
                    updateDraft(definition.type, "source", event.target.value)
                  }
                />
              </label>
              <button disabled={busy} type="submit">
                <Icon name="check" />
                {t(ar, "حفظ المحور", "Save area")}
              </button>
            </form>
          );
        })}
      </section>
      <section className="pse-evidence pse-panel">
        <header>
          <Icon name="mail" />
          <div>
            <h2>{t(ar, "مرفقات وأدلة المشروع", "Project evidence files")}</h2>
            <p>
              {t(
                ar,
                "ارفع مستندات فعلية تدعم الدرجات والمصادر المسجلة.",
                "Upload real documents supporting the recorded scores and sources.",
              )}
            </p>
          </div>
        </header>
        <form onSubmit={(event) => void uploadEvidence(event)}>
          <input
            accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp,.txt"
            aria-label={t(ar, "ملف دليل التقييم", "Evaluation evidence file")}
            onChange={selectFile}
            type="file"
          />
          <button disabled={!file || uploading} type="submit">
            <Icon name="plus" />
            {uploading ? t(ar, "جارٍ الرفع...", "Uploading...") : t(ar, "رفع الدليل", "Upload evidence")}
          </button>
        </form>
        <ul>
          {project.evidenceFiles.map((evidence) => (
            <li key={evidence.id}>
              <a href={`/api/files/${evidence.id}`}>{evidence.fileName}</a>
              <small>
                {evidence.mimeType} · {Number(evidence.sizeBytes).toLocaleString()} B
              </small>
            </li>
          ))}
          {!project.evidenceFiles.length ? (
            <li>{t(ar, "لا توجد ملفات أدلة بعد.", "No evidence files yet.")}</li>
          ) : null}
        </ul>
      </section>
    </>
  );
}

function ResultsScreen({
  ar,
  busy,
  project,
  quality,
  run,
}: {
  ar: boolean;
  busy: boolean;
  project: EvaluationProject;
  quality: Quality;
  run: RunCommand;
}) {
  const [rationale, setRationale] = useState(project.decisions[0]?.rationale ?? "");
  const evaluationPhase = project.phases.find((phase) => phase.type === "EVALUATION");
  const analysisPhase = project.phases.find((phase) => phase.type === "ANALYSIS");
  const feasibilityPhase = project.phases.find((phase) => phase.type === "FEASIBILITY");
  const prerequisitesComplete =
    analysisPhase?.status === "COMPLETED" && feasibilityPhase?.status === "COMPLETED";
  const hasFinancialPlan = project.financialPlans.length > 0;
  const canRecord =
    evaluationPhase?.status === "ACTIVE" &&
    hasFinancialPlan &&
    rationale.trim().length >= 10;
  const canApprove = canRecord && quality.verdict === "APPROVE";
  const latestDecision = project.decisions[0];

  async function recordDecision(verdict: "APPROVE" | "REJECT" | "RETURN_FOR_REVIEW") {
    await run(
      {
        action: "recordDecision",
        projectId: project.id,
        verdict,
        rationale,
      },
      t(ar, "تم توثيق قرار التقييم.", "Evaluation decision recorded."),
    );
  }

  return (
    <>
      <EvaluationHero
        ar={ar}
        description={[
          "نتائج موزونة مبنية على البيانات والأدلة المدخلة والمعايير المعتمدة.",
          "Weighted results based on submitted data, evidence, and approved criteria.",
        ]}
        icon="barChart"
        quote={["قرار واضح مبني على أدلة", "A clear decision based on evidence"]}
        title={["نتائج تقييم المشروع", "Project evaluation results"]}
      />
      <section className="pse-result-banner">
        <ScoreRing
          ar={ar}
          label={verdictLabel(quality.verdict, ar)}
          score={quality.readyForDecision ? quality.score : null}
        />
        <div>
          <span>{t(ar, "النتيجة النهائية", "Final score")}</span>
          <h2>{quality.readyForDecision ? `${quality.score}/100` : "—/100"}</h2>
          <small>
            {quality.readyForDecision
              ? t(ar, "نتيجة موزونة من المحاور الستة", "Weighted across all six areas")
              : t(ar, "تظهر بعد اكتمال المحاور الستة", "Shown after all six areas are complete")}
          </small>
        </div>
        <div className="pse-result-banner__status">
          <span>{t(ar, "حالة الجاهزية", "Readiness state")}</span>
          <b>{verdictLabel(quality.verdict, ar)}</b>
          <p>
            {latestDecision
              ? t(
                  ar,
                  `آخر قرار موثق: ${verdictLabel(latestDecision.verdict, ar)}.`,
                  `Latest recorded decision: ${verdictLabel(latestDecision.verdict, ar)}.`,
                )
              : t(ar, "لم يسجل قرار بشري بعد.", "No human decision has been recorded yet.")}
          </p>
        </div>
        <div className="pse-result-banner__actions">
          <Link href={`/projects/start/evaluation/recommendations?project=${project.id}`}>
            {t(ar, "عرض التوصيات", "View recommendations")}
            <Icon name="arrow" />
          </Link>
          <Link href={`/projects/start/evaluation/report?project=${project.id}`}>
            {t(ar, "فتح التقرير", "Open report")}
            <Icon name="mail" />
          </Link>
        </div>
      </section>
      <section className="pse-result-metrics">
        {assessmentDefinitions.map((definition) => (
          <MetricCard
            ar={ar}
            definition={definition}
            key={definition.type}
            score={assessmentFor(project, definition.type)?.score}
          />
        ))}
      </section>
      <section className="pse-result-grid">
        <article className="pse-panel">
          <header>
            <Icon name="activity" />
            <h2>{t(ar, "التحليل الشامل", "Comprehensive analysis")}</h2>
          </header>
          <RadarChart ar={ar} project={project} />
        </article>
        <article className="pse-panel pse-weighted-bars">
          <header>
            <Icon name="barChart" />
            <h2>{t(ar, "أداء المعايير حسب الأوزان", "Weighted criteria performance")}</h2>
          </header>
          {assessmentDefinitions.map((definition) => {
            const score = assessmentFor(project, definition.type)?.score;
            const contribution =
              score === null || score === undefined
                ? null
                : Math.round((score * definition.weight) / 100);
            return (
              <div key={definition.type}>
                <span>
                  <b>{pick(definition.shortLabel, ar)}</b>
                  <small>{t(ar, `الوزن ${definition.weight}%`, `Weight ${definition.weight}%`)}</small>
                </span>
                <i>
                  <em style={{ width: `${score ?? 0}%` }} />
                </i>
                <strong>{contribution === null ? "—" : `+${contribution}`}</strong>
              </div>
            );
          })}
        </article>
        <article className="pse-panel pse-decision">
          <header>
            <Icon name="shield" />
            <h2>{t(ar, "القرار التنفيذي", "Executive decision")}</h2>
          </header>
          <div className="pse-decision__requirements">
            <span className={prerequisitesComplete ? "is-complete" : ""}>
              <Icon name={prerequisitesComplete ? "check" : "lock"} />
              {t(ar, "اكتمال التحليل والجدوى", "Analysis and feasibility complete")}
            </span>
            <span className={evaluationPhase?.status === "ACTIVE" || evaluationPhase?.status === "COMPLETED" ? "is-complete" : ""}>
              <Icon name={evaluationPhase?.status === "ACTIVE" || evaluationPhase?.status === "COMPLETED" ? "check" : "lock"} />
              {t(ar, "مرحلة التقييم مفعلة", "Evaluation phase active")}
            </span>
            <span className={quality.readyForDecision ? "is-complete" : ""}>
              <Icon name={quality.readyForDecision ? "check" : "lock"} />
              {t(ar, "الأدلة مكتملة", "Evidence complete")}
            </span>
            <span className={hasFinancialPlan ? "is-complete" : ""}>
              <Icon name={hasFinancialPlan ? "check" : "lock"} />
              {t(ar, "الخطة المالية محفوظة", "Financial plan saved")}
            </span>
          </div>
          {evaluationPhase?.status === "PENDING" ? (
            <button
              className="pse-secondary"
              disabled={busy || !prerequisitesComplete}
              onClick={() =>
                void run(
                  {
                    action: "updatePhase",
                    projectId: project.id,
                    phaseType: "EVALUATION",
                    status: "ACTIVE",
                    notes: "Evaluation started from the project launch workspace",
                  },
                  t(ar, "تم تفعيل مرحلة التقييم.", "Evaluation phase activated."),
                )
              }
              type="button"
            >
              <Icon name="activity" />
              {t(ar, "تفعيل مرحلة التقييم", "Activate evaluation phase")}
            </button>
          ) : null}
          {!hasFinancialPlan ? (
            <Link
              className="pse-inline-link"
              href={`/projects/feasibility/pro/financial?project=${project.id}`}
            >
              {t(ar, "إكمال الخطة المالية", "Complete financial plan")}
              <Icon name="arrow" />
            </Link>
          ) : null}
          <label>
            <span>{t(ar, "مبررات القرار", "Decision rationale")}</span>
            <textarea
              maxLength={4000}
              minLength={10}
              rows={4}
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder={t(ar, "اكتب مبررات موثقة للقرار...", "Document the decision rationale...")}
            />
          </label>
          <div className="pse-decision__buttons">
            <button
              disabled={busy || !canApprove}
              onClick={() => void recordDecision("APPROVE")}
              type="button"
            >
              <Icon name="check" />
              {t(ar, "اعتماد التقييم", "Approve evaluation")}
            </button>
            <button
              className="pse-secondary"
              disabled={busy || !canRecord}
              onClick={() => void recordDecision("RETURN_FOR_REVIEW")}
              type="button"
            >
              {t(ar, "إعادة للمراجعة", "Return for review")}
            </button>
            <button
              className="pse-danger"
              disabled={busy || !canRecord}
              onClick={() => void recordDecision("REJECT")}
              type="button"
            >
              {t(ar, "رفض", "Reject")}
            </button>
          </div>
          {evaluationPhase?.status === "ACTIVE" ? (
            <button
              className="pse-complete-phase"
              disabled={
                busy ||
                latestDecision?.verdict !== "APPROVE" ||
                quality.verdict !== "APPROVE"
              }
              onClick={() =>
                void run(
                  {
                    action: "updatePhase",
                    projectId: project.id,
                    phaseType: "EVALUATION",
                    status: "COMPLETED",
                    notes: "Evaluation approved and completed",
                  },
                  t(ar, "اكتملت مرحلة التقييم.", "Evaluation phase completed."),
                )
              }
              type="button"
            >
              <Icon name="check" />
              {t(ar, "إكمال مرحلة التقييم", "Complete evaluation phase")}
            </button>
          ) : null}
        </article>
      </section>
    </>
  );
}

function RisksScreen({
  ar,
  busy,
  project,
  run,
}: {
  ar: boolean;
  busy: boolean;
  project: EvaluationProject;
  run: RunCommand;
}) {
  const [draft, setDraft] = useState({
    category: "MARKET",
    title: "",
    likelihood: "3",
    impact: "3",
    mitigation: "",
    ownerLabel: "",
    reviewAt: "",
  });
  const openRisks = project.risks.filter((risk) => risk.status === "OPEN");
  const highRisks = openRisks.filter((risk) => risk.score >= 15);
  const averageRisk = project.risks.length
    ? Math.round(
        (project.risks.reduce((total, risk) => total + risk.score, 0) /
          project.risks.length /
          25) *
          100,
      )
    : null;

  async function createRisk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await run(
      {
        action: "createRisk",
        projectId: project.id,
        category: draft.category,
        title: draft.title,
        likelihood: Number(draft.likelihood),
        impact: Number(draft.impact),
        mitigation: draft.mitigation,
        ownerLabel: draft.ownerLabel,
        reviewAt: draft.reviewAt
          ? new Date(draft.reviewAt).toISOString()
          : undefined,
      },
      t(ar, "تمت إضافة الخطر وخطة التخفيف.", "Risk and mitigation plan added."),
    );
    if (saved) {
      setDraft((current) => ({
        ...current,
        title: "",
        mitigation: "",
        ownerLabel: "",
        reviewAt: "",
      }));
    }
  }

  return (
    <>
      <EvaluationHero
        ar={ar}
        description={[
          "حدد مخاطر المشروع الفعلية واحتمالها وأثرها وخطة التخفيف والمسؤول عنها.",
          "Document real project risks, likelihood, impact, mitigation, and accountable owner.",
        ]}
        icon="shield"
        quote={["إدارة المخاطر اليوم تصنع فرص الغد", "Managing risk today protects tomorrow's opportunity"]}
        title={["تحليل المخاطر", "Risk analysis"]}
      />
      <section className="pse-risk-summary">
        <article className="pse-panel">
          <ScoreRing
            ar={ar}
            label={project.risks.length ? t(ar, "مؤشر التعرض", "Exposure index") : t(ar, "لا توجد سجلات", "No records")}
            score={averageRisk}
          />
          <div>
            <h2>{t(ar, "المؤشر العام للمخاطر", "Overall risk indicator")}</h2>
            <strong>
              {highRisks.length
                ? t(ar, `${highRisks.length} مخاطر عالية مفتوحة`, `${highRisks.length} open high risks`)
                : t(ar, "لا توجد مخاطر عالية مفتوحة", "No open high risks")}
            </strong>
            <small>
              {t(ar, `${project.risks.length} مخاطر مسجلة`, `${project.risks.length} risks recorded`)}
            </small>
          </div>
        </article>
        {["FINANCIAL", "OPERATIONAL", "COMPLIANCE", "MARKET", "TECHNICAL"].map(
          (category) => {
            const risks = project.risks.filter(
              (risk) => risk.category.toUpperCase() === category,
            );
            const score = risks.length
              ? Math.round(
                  (risks.reduce((total, risk) => total + risk.score, 0) /
                    risks.length /
                    25) *
                    100,
                )
              : null;
            const definition = assessmentDefinitions.find(
              (item) => item.type === category,
            );
            return (
              <article className="pse-risk-category" key={category}>
                <Icon name={definition?.icon ?? "shield"} />
                <span>{definition ? pick(definition.shortLabel, ar) : category}</span>
                <b>{score ?? "—"}</b>
                <small>
                  {risks.length
                    ? t(ar, `${risks.length} سجلات`, `${risks.length} records`)
                    : t(ar, "غير مقيم", "Not assessed")}
                </small>
              </article>
            );
          },
        )}
      </section>
      <section className="pse-risk-grid">
        <article className="pse-panel pse-risk-matrix">
          <header>
            <Icon name="grid" />
            <h2>{t(ar, "مصفوفة المخاطر", "Risk matrix")}</h2>
          </header>
          <div className="pse-risk-matrix__plot">
            {Array.from({ length: 25 }, (_, index) => <i key={index} />)}
            {project.risks.map((risk, index) => (
              <span
                key={risk.id}
                style={{
                  insetInlineStart: `${(risk.likelihood - 0.5) * 20}%`,
                  bottom: `${(risk.impact - 0.5) * 20}%`,
                }}
                title={`${risk.title}: ${risk.score}/25`}
              >
                {index + 1}
              </span>
            ))}
          </div>
          <footer>
            <small>{t(ar, "منخفض", "Low")}</small>
            <b>{t(ar, "الاحتمالية", "Likelihood")}</b>
            <small>{t(ar, "مرتفع", "High")}</small>
          </footer>
        </article>
        <article className="pse-panel pse-high-risks">
          <header>
            <Icon name="activity" />
            <h2>{t(ar, "أعلى المخاطر", "Top risks")}</h2>
          </header>
          {project.risks.slice(0, 5).map((risk, index) => (
            <div key={risk.id}>
              <b>{index + 1}</b>
              <span>
                <strong>{risk.title}</strong>
                <small>{risk.mitigation}</small>
              </span>
              <em className={risk.score >= 15 ? "is-high" : risk.score >= 8 ? "is-medium" : "is-low"}>
                {risk.score}/25
              </em>
            </div>
          ))}
          {!project.risks.length ? (
            <p>{t(ar, "لا توجد مخاطر مسجلة.", "No risks have been recorded.")}</p>
          ) : null}
        </article>
        <form
          className="pse-panel pse-risk-form"
          data-testid="evaluation-risk-form"
          onSubmit={(event) => void createRisk(event)}
        >
          <header>
            <Icon name="plus" />
            <h2>{t(ar, "إضافة خطر جديد", "Add a new risk")}</h2>
          </header>
          <label>
            <span>{t(ar, "الفئة", "Category")}</span>
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft((current) => ({ ...current, category: event.target.value }))
              }
            >
              {["MARKET", "FINANCIAL", "OPERATIONAL", "TECHNICAL", "COMPLIANCE"].map(
                (category) => <option key={category}>{category}</option>,
              )}
            </select>
          </label>
          <label>
            <span>{t(ar, "وصف الخطر", "Risk description")}</span>
            <input
              maxLength={300}
              minLength={3}
              required
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </label>
          <div>
            <label>
              <span>{t(ar, "الاحتمالية 1-5", "Likelihood 1-5")}</span>
              <input
                max="5"
                min="1"
                required
                type="number"
                value={draft.likelihood}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, likelihood: event.target.value }))
                }
              />
            </label>
            <label>
              <span>{t(ar, "الأثر 1-5", "Impact 1-5")}</span>
              <input
                max="5"
                min="1"
                required
                type="number"
                value={draft.impact}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, impact: event.target.value }))
                }
              />
            </label>
          </div>
          <label>
            <span>{t(ar, "خطة التخفيف", "Mitigation plan")}</span>
            <textarea
              maxLength={4000}
              minLength={3}
              required
              rows={2}
              value={draft.mitigation}
              onChange={(event) =>
                setDraft((current) => ({ ...current, mitigation: event.target.value }))
              }
            />
          </label>
          <div>
            <label>
              <span>{t(ar, "المسؤول", "Owner")}</span>
              <input
                maxLength={160}
                minLength={2}
                required
                value={draft.ownerLabel}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, ownerLabel: event.target.value }))
                }
              />
            </label>
            <label>
              <span>{t(ar, "موعد المراجعة", "Review date")}</span>
              <input
                type="date"
                value={draft.reviewAt}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, reviewAt: event.target.value }))
                }
              />
            </label>
          </div>
          <button disabled={busy} type="submit">
            <Icon name="plus" />
            {t(ar, "حفظ الخطر", "Save risk")}
          </button>
        </form>
      </section>
      <section className="pse-panel pse-risk-register">
        <header>
          <Icon name="mail" />
          <h2>{t(ar, "سجل المخاطر والتقييم التفصيلي", "Detailed risk register")}</h2>
        </header>
        <div className="pse-table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t(ar, "الخطر", "Risk")}</th>
                <th>{t(ar, "الفئة", "Category")}</th>
                <th>{t(ar, "الاحتمالية", "Likelihood")}</th>
                <th>{t(ar, "الأثر", "Impact")}</th>
                <th>{t(ar, "الخطة", "Mitigation")}</th>
                <th>{t(ar, "المسؤول", "Owner")}</th>
                <th>{t(ar, "الحالة", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {project.risks.map((risk, index) => (
                <tr key={risk.id}>
                  <td>{index + 1}</td>
                  <td>{risk.title}</td>
                  <td>{risk.category}</td>
                  <td>{risk.likelihood}/5</td>
                  <td>{risk.impact}/5</td>
                  <td>{risk.mitigation}</td>
                  <td>{risk.ownerLabel}</td>
                  <td>
                    <select
                      disabled={busy}
                      value={risk.status}
                      onChange={(event) =>
                        void run(
                          {
                            action: "updateRiskStatus",
                            projectId: project.id,
                            riskId: risk.id,
                            status: event.target.value,
                          },
                          t(ar, "تم تحديث حالة الخطر.", "Risk status updated."),
                        )
                      }
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="MITIGATING">MITIGATING</option>
                      <option value="ACCEPTED">ACCEPTED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function RecommendationsScreen({
  ar,
  project,
  quality,
}: {
  ar: boolean;
  project: EvaluationProject;
  quality: Quality;
}) {
  const urgent = project.risks.filter(
    (risk) => risk.score >= 15 && ["OPEN", "MITIGATING"].includes(risk.status),
  );
  const improvements = assessmentDefinitions.filter(({ type }) => {
    const score = assessmentFor(project, type)?.score;
    return score !== null && score !== undefined && score < 75;
  });
  const opportunities = assessmentDefinitions.filter(
    ({ type }) => (assessmentFor(project, type)?.score ?? -1) >= 80,
  );
  const evaluationPhase = project.phases.find((phase) => phase.type === "EVALUATION");
  const nextSteps = [
    {
      done: quality.completeness === 100,
      label: ["اكتمال محاور التقييم الستة", "Complete all six evaluation areas"] as Copy,
      href: `/projects/start/evaluation/new?project=${project.id}`,
    },
    {
      done: project.financialPlans.length > 0,
      label: ["حفظ الخطة المالية", "Save the financial plan"] as Copy,
      href: `/projects/feasibility/pro/financial?project=${project.id}`,
    },
    {
      done: !urgent.length,
      label: ["تخفيف أو قبول المخاطر العالية", "Mitigate or accept high risks"] as Copy,
      href: `/projects/start/evaluation/risks?project=${project.id}`,
    },
    {
      done: project.decisions[0]?.verdict === "APPROVE",
      label: ["توثيق قرار الاعتماد", "Record the approval decision"] as Copy,
      href: `/projects/start/evaluation/result?project=${project.id}`,
    },
    {
      done: evaluationPhase?.status === "COMPLETED",
      label: ["إكمال مرحلة التقييم", "Complete the evaluation phase"] as Copy,
      href: `/projects/start/evaluation/result?project=${project.id}`,
    },
  ];
  return (
    <>
      <EvaluationHero
        ar={ar}
        description={[
          "توصيات حتمية مشتقة من درجات التقييم والمخاطر المسجلة دون افتراض نتائج غير موثقة.",
          "Deterministic recommendations derived from recorded scores and risks without unsupported forecasts.",
        ]}
        icon="sparkles"
        quote={["قرارات أفضل لمستقبل أكثر نجاحًا", "Better decisions for a stronger future"]}
        title={["التوصيات وخطة التحسين", "Recommendations and improvement plan"]}
      />
      <section className="pse-recommendation-stats">
        <article>
          <Icon name="barChart" />
          <span>{t(ar, "إجمالي التوصيات", "Total recommendations")}</span>
          <b>{urgent.length + improvements.length + opportunities.length}</b>
          <small>{t(ar, "مشتقة من السجلات", "Derived from live records")}</small>
        </article>
        <article>
          <Icon name="activity" />
          <span>{t(ar, "إجراءات عاجلة", "Urgent actions")}</span>
          <b>{urgent.length}</b>
          <small>{t(ar, "مخاطر عالية", "High risks")}</small>
        </article>
        <article>
          <Icon name="settings" />
          <span>{t(ar, "محاور تحتاج تحسينًا", "Areas to improve")}</span>
          <b>{improvements.length}</b>
          <small>{t(ar, "أقل من 75", "Below 75")}</small>
        </article>
        <article>
          <Icon name="trend" />
          <span>{t(ar, "نقاط قوة", "Strengths")}</span>
          <b>{opportunities.length}</b>
          <small>{t(ar, "80 فأعلى", "80 or higher")}</small>
        </article>
        <article>
          <Icon name="shield" />
          <span>{t(ar, "القرار المقترح", "Suggested decision")}</span>
          <b>{verdictLabel(quality.verdict, ar)}</b>
          <small>{t(ar, "يتطلب اعتمادًا بشريًا", "Requires human approval")}</small>
        </article>
      </section>
      <section className="pse-recommendation-columns">
        <article className="pse-panel is-urgent">
          <header>
            <Icon name="activity" />
            <h2>{t(ar, "إجراءات عاجلة", "Urgent actions")}</h2>
            <span>{urgent.length}</span>
          </header>
          {urgent.map((risk, index) => (
            <div key={risk.id}>
              <b>{index + 1}</b>
              <span>
                <strong>{risk.title}</strong>
                <small>{risk.mitigation}</small>
              </span>
            </div>
          ))}
          {!urgent.length ? (
            <p>{t(ar, "لا توجد مخاطر عالية مفتوحة.", "No open high risks.")}</p>
          ) : null}
        </article>
        <article className="pse-panel is-improvement">
          <header>
            <Icon name="settings" />
            <h2>{t(ar, "تحسينات متوسطة المدى", "Medium-term improvements")}</h2>
            <span>{improvements.length}</span>
          </header>
          {improvements.map((definition, index) => {
            const assessment = assessmentFor(project, definition.type);
            return (
              <div key={definition.type}>
                <b>{index + 1}</b>
                <span>
                  <strong>{pick(definition.label, ar)}</strong>
                  <small>
                    {assessment?.summary ??
                      t(ar, "أكمل الدليل أولًا.", "Complete the evidence first.")}
                  </small>
                </span>
              </div>
            );
          })}
          {!improvements.length ? (
            <p>{t(ar, "لا توجد محاور مكتملة دون 75.", "No completed area is below 75.")}</p>
          ) : null}
        </article>
        <article className="pse-panel is-opportunity">
          <header>
            <Icon name="trend" />
            <h2>{t(ar, "فرص نمو وتوسع", "Growth opportunities")}</h2>
            <span>{opportunities.length}</span>
          </header>
          {opportunities.map((definition, index) => {
            const assessment = assessmentFor(project, definition.type);
            return (
              <div key={definition.type}>
                <b>{index + 1}</b>
                <span>
                  <strong>{pick(definition.label, ar)}</strong>
                  <small>
                    {t(
                      ar,
                      `درجة موثقة ${assessment?.score}/100؛ تحقق من قابلية تحويلها إلى فرصة تنفيذية.`,
                      `Documented score ${assessment?.score}/100; validate how it can become an execution opportunity.`,
                    )}
                  </small>
                </span>
              </div>
            );
          })}
          {!opportunities.length ? (
            <p>{t(ar, "لا توجد نقاط قوة بدرجة 80 أو أعلى بعد.", "No score of 80 or higher yet.")}</p>
          ) : null}
        </article>
      </section>
      <section className="pse-recommendation-bottom">
        <article className="pse-panel pse-timeline">
          <header>
            <Icon name="activity" />
            <h2>{t(ar, "الجدول الزمني لخطة القرار", "Decision plan timeline")}</h2>
          </header>
          <div>
            <span>
              <b>1</b>
              <strong>{t(ar, "معالجة عاجلة", "Immediate action")}</strong>
              <small>{t(ar, "المخاطر العالية", "High risks")}</small>
            </span>
            <span>
              <b>2</b>
              <strong>{t(ar, "تحسين الجاهزية", "Improve readiness")}</strong>
              <small>{t(ar, "المحاور دون 75", "Areas below 75")}</small>
            </span>
            <span>
              <b>3</b>
              <strong>{t(ar, "اعتماد الانتقال", "Approve progression")}</strong>
              <small>{t(ar, "قرار بشري موثق", "Documented human decision")}</small>
            </span>
          </div>
        </article>
        <article className="pse-panel pse-next-steps">
          <header>
            <Icon name="check" />
            <h2>{t(ar, "أهم الخطوات التالية", "Next required steps")}</h2>
          </header>
          {nextSteps.map((step) => (
            <Link className={step.done ? "is-complete" : ""} href={step.href} key={step.href + step.label[1]}>
              <Icon name={step.done ? "check" : "arrow"} />
              <span>{pick(step.label, ar)}</span>
              <small>{step.done ? t(ar, "مكتمل", "Complete") : t(ar, "مطلوب", "Required")}</small>
            </Link>
          ))}
        </article>
        <article className="pse-panel pse-recommended-decision">
          <header>
            <Icon name="rocket" />
            <h2>{t(ar, "القرار المقترح", "Suggested decision")}</h2>
          </header>
          <strong>{verdictLabel(quality.verdict, ar)}</strong>
          <p>
            {t(
              ar,
              "هذه توصية حسابية وليست اعتمادًا نهائيًا. سجّل القرار ومبرراته في صفحة النتائج.",
              "This is a calculated recommendation, not final approval. Record the decision and rationale on the results page.",
            )}
          </p>
          <Link href={`/projects/start/evaluation/result?project=${project.id}`}>
            {t(ar, "توثيق القرار", "Record decision")}
            <Icon name="arrow" />
          </Link>
        </article>
      </section>
    </>
  );
}

function ReportScreen({
  ar,
  locale,
  project,
  quality,
}: {
  ar: boolean;
  locale: Locale;
  project: EvaluationProject;
  quality: Quality;
}) {
  const completedItems =
    assessmentDefinitions.length - quality.missing.length +
    (project.decisions[0] ? 1 : 0) +
    (project.financialPlans.length ? 1 : 0);
  const reportReadiness = Math.round(
    (completedItems / (assessmentDefinitions.length + 2)) * 100,
  );
  return (
    <>
      <EvaluationHero
        ar={ar}
        description={[
          "تقرير إنتاجي يجمع نتائج التقييم والمخاطر والقرار الموثق في مستند قابل للطباعة.",
          "A production report combining evaluation results, risks, and the recorded decision in a printable document.",
        ]}
        icon="mail"
        quote={["تقارير موثقة لقرارات أكثر ثقة", "Documented reports for more confident decisions"]}
        title={["تقرير تقييم المشروع", "Project evaluation report"]}
      />
      <section className="pse-report-layout">
        <aside className="pse-panel pse-report-pages">
          <header>
            <h2>{t(ar, "محتويات التقرير", "Report contents")}</h2>
            <span>6</span>
          </header>
          {[
            ["الغلاف والملخص", "Cover and summary"],
            ["نتائج المحاور", "Area results"],
            ["تحليل الأوزان", "Weighted analysis"],
            ["المخاطر وخطط التخفيف", "Risks and mitigation"],
            ["التوصيات", "Recommendations"],
            ["القرار والأدلة", "Decision and evidence"],
          ].map((item, index) => (
            <span className={index === 0 ? "is-active" : ""} key={item[1]}>
              <b>{index + 1}</b>
              {t(ar, item[0], item[1])}
            </span>
          ))}
        </aside>
        <article className="pse-report-preview">
          <header>
            <div className="pse-report-brand">
              <Icon name="barChart" />
              <span>
                <b>Jenan PRO</b>
                <small>جنان برو</small>
              </span>
            </div>
            <small>{formatDate(project.updatedAt, locale)}</small>
          </header>
          <div className="pse-report-cover">
            <h1>{t(ar, "تقرير تقييم المشروع", "Project evaluation report")}</h1>
            <h2>{project.name}</h2>
            <p>
              {t(
                ar,
                "تحليل شامل للجدوى السوقية والمالية والتشغيلية والتقنية والمخاطر والامتثال.",
                "A complete analysis of market, financial, operational, technical, risk, and compliance readiness.",
              )}
            </p>
          </div>
          <dl>
            <div>
              <dt>{t(ar, "القطاع", "Sector")}</dt>
              <dd>{project.sector ?? t(ar, "غير محدد", "Not set")}</dd>
            </div>
            <div>
              <dt>{t(ar, "الدولة", "Country")}</dt>
              <dd>{project.countryCode ?? t(ar, "غير محددة", "Not set")}</dd>
            </div>
            <div>
              <dt>{t(ar, "النتيجة", "Score")}</dt>
              <dd>{quality.readyForDecision ? `${quality.score}/100` : "—"}</dd>
            </div>
          </dl>
          <section>
            <h3>{t(ar, "الملخص التنفيذي", "Executive summary")}</h3>
            <p>
              {quality.readyForDecision
                ? t(
                    ar,
                    `اكتمل التقييم بنتيجة موزونة ${quality.score} من 100 وتصنيف «${verdictLabel(quality.verdict, ar)}».`,
                    `The evaluation is complete with a weighted score of ${quality.score}/100 and a “${verdictLabel(quality.verdict, ar)}” classification.`,
                  )
                : t(
                    ar,
                    `التقييم غير مكتمل؛ يتبقى ${quality.missing.length} من المحاور المطلوبة.`,
                    `The evaluation is incomplete; ${quality.missing.length} required areas remain.`,
                  )}
            </p>
          </section>
          <section className="pse-report-scores">
            {assessmentDefinitions.map((definition) => (
              <span key={definition.type}>
                <Icon name={definition.icon} />
                <small>{pick(definition.shortLabel, ar)}</small>
                <b>{assessmentFor(project, definition.type)?.score ?? "—"}</b>
              </span>
            ))}
          </section>
          <section>
            <h3>{t(ar, "القرار الموثق", "Recorded decision")}</h3>
            <p>
              {project.decisions[0]
                ? `${verdictLabel(project.decisions[0].verdict, ar)} — ${project.decisions[0].rationale}`
                : t(ar, "لم يسجل قرار بشري حتى الآن.", "No human decision has been recorded yet.")}
            </p>
          </section>
          <footer>
            <span>Jenan PRO</span>
            <small>{t(ar, "سري — للاستخدام من أصحاب الصلاحية", "Confidential — authorized use only")}</small>
          </footer>
        </article>
        <aside className="pse-report-tools">
          <article className="pse-panel">
            <header>
              <Icon name="briefcase" />
              <h2>{t(ar, "تصدير التقرير", "Export report")}</h2>
            </header>
            <a href={`/api/projects/${project.id}/report`}>
              <Icon name="mail" />
              <span>
                <b>{t(ar, "تنزيل PDF", "Download PDF")}</b>
                <small>{t(ar, "التصدير المدعوم", "Supported export")}</small>
              </span>
            </a>
            <button onClick={() => window.print()} type="button">
              <Icon name="briefcase" />
              <span>
                <b>{t(ar, "طباعة مباشرة", "Print directly")}</b>
                <small>{t(ar, "من المتصفح", "From the browser")}</small>
              </span>
            </button>
          </article>
          <article className="pse-panel pse-report-ready">
            <header>
              <Icon name="check" />
              <h2>{t(ar, "جاهزية التقرير", "Report readiness")}</h2>
            </header>
            <ScoreRing
              ar={ar}
              label={
                reportReadiness === 100
                  ? t(ar, "جاهز", "Ready")
                  : t(ar, "غير مكتمل", "Incomplete")
              }
              score={reportReadiness}
            />
            <dl>
              <div>
                <dt>{t(ar, "محاور مكتملة", "Completed areas")}</dt>
                <dd>{assessmentDefinitions.length - quality.missing.length}/{assessmentDefinitions.length}</dd>
              </div>
              <div>
                <dt>{t(ar, "المخاطر المسجلة", "Recorded risks")}</dt>
                <dd>{project.risks.length}</dd>
              </div>
              <div>
                <dt>{t(ar, "قرار بشري", "Human decision")}</dt>
                <dd>{project.decisions[0] ? t(ar, "موجود", "Recorded") : t(ar, "غير موجود", "Missing")}</dd>
              </div>
            </dl>
          </article>
        </aside>
      </section>
    </>
  );
}

export function ProjectEvaluationWorkspace({
  locale,
  route,
  userLabel,
}: {
  locale: Locale;
  route: string;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedProjectId = searchParams.get("project") ?? "";
  const activeRoute = canonicalEvaluationRoute(route);
  const [projects, setProjects] = useState<EvaluationProject[]>([]);
  const [selectedId, setSelectedId] = useState(requestedProjectId);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (preferredId = "") => {
      setLoading(true);
      try {
        const loaded = await listEvaluationProjects();
        setProjects(loaded);
        setSelectedId((current) => {
          const candidate = preferredId || requestedProjectId || current;
          return loaded.some((project) => project.id === candidate)
            ? candidate
            : (loaded[0]?.id ?? "");
        });
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : t(ar, "تعذر تحميل المشاريع.", "Projects could not be loaded."),
        );
      } finally {
        setLoading(false);
      }
    },
    [ar, requestedProjectId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId),
    [projects, selectedId],
  );
  const quality = useMemo(
    () => (selected ? qualityFor(selected) : null),
    [selected],
  );

  async function run(
    body: Record<string, unknown>,
    successMessage: string,
  ) {
    setBusy(true);
    setMessage("");
    try {
      await projectCommand(body);
      await load(selectedId);
      setMessage(successMessage);
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t(ar, "تعذر تنفيذ العملية.", "The operation could not be completed."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  function changeProject(projectId: string) {
    setSelectedId(projectId);
    router.push(`${activeRoute}?project=${projectId}`);
  }

  let screen;
  if (loading) {
    screen = (
      <div className="pse-loading">
        <Icon name="activity" />
        {t(ar, "جارٍ تحميل بيانات التقييم...", "Loading evaluation data...")}
      </div>
    );
  } else if (!selected || !quality) {
    screen = (
      <div className="pse-empty">
        <Icon name="barChart" />
        <h1>{t(ar, "أنشئ مشروعًا لبدء التقييم", "Create a project to begin evaluation")}</h1>
        <p>
          {t(
            ar,
            "يعمل التقييم على سجل المشروع نفسه داخل رحلة بدء المشروع.",
            "Evaluation uses the same project record throughout the project launch journey.",
          )}
        </p>
        <Link href="/projects/start/new?new=1">
          {t(ar, "إنشاء مشروع", "Create project")}
          <Icon name="arrow" />
        </Link>
      </div>
    );
  } else if (activeRoute.endsWith("/new")) {
    screen = (
      <InputScreen
        ar={ar}
        busy={busy}
        key={selected.id}
        onMessage={setMessage}
        onReload={() => load(selected.id)}
        project={selected}
        quality={quality}
        run={run}
      />
    );
  } else if (activeRoute.endsWith("/result")) {
    screen = (
      <ResultsScreen
        ar={ar}
        busy={busy}
        project={selected}
        quality={quality}
        run={run}
      />
    );
  } else if (activeRoute.endsWith("/risks")) {
    screen = <RisksScreen ar={ar} busy={busy} project={selected} run={run} />;
  } else if (activeRoute.endsWith("/recommendations")) {
    screen = (
      <RecommendationsScreen ar={ar} project={selected} quality={quality} />
    );
  } else if (activeRoute.endsWith("/report")) {
    screen = (
      <ReportScreen
        ar={ar}
        locale={locale}
        project={selected}
        quality={quality}
      />
    );
  } else {
    screen = (
      <OverviewScreen
        ar={ar}
        locale={locale}
        project={selected}
        quality={quality}
      />
    );
  }

  return (
    <main
      className="project-start-evaluation"
      data-project-evaluation-requested-route={route}
      data-project-evaluation-route={activeRoute}
      data-project-evaluation-source="ACCOUNT_PROJECT_RECORDS"
      data-project-start-route={activeRoute}
      dir={ar ? "rtl" : "ltr"}
    >
      <header className="pse-topbar">
        <Link className="pse-brand" href="/projects">
          <Icon name="barChart" />
          <span>
            <b>Jenan PRO</b>
            <small>جنان برو</small>
          </span>
        </Link>
        <label className="pse-project-selector">
          <Icon name="search" />
          <select
            aria-label={t(ar, "المشروع الحالي", "Current project")}
            disabled={!projects.length}
            onChange={(event) => changeProject(event.target.value)}
            value={selectedId}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <div className="pse-user">
          <button
            aria-label={t(ar, "لا توجد تنبيهات جديدة", "No new notifications")}
            disabled
            type="button"
          >
            <Icon name="bell" />
          </button>
          <span>{userLabel.slice(0, 2).toUpperCase()}</span>
          <b>{userLabel}</b>
        </div>
      </header>
      <div className="pse-shell">
        <EvaluationSidebar
          activeRoute={activeRoute}
          ar={ar}
          projectId={selected?.id}
        />
        <section className="pse-content">
          {message ? (
            <p className="pse-message" role="status">
              {message}
            </p>
          ) : null}
          {screen}
        </section>
      </div>
    </main>
  );
}

export function ProjectEvaluationDashboard({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  return (
    <ProjectEvaluationWorkspace
      locale={locale}
      route="/projects/evaluation"
      userLabel={userLabel}
    />
  );
}
