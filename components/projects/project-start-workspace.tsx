"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { Icon } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type JsonRecord = Record<string, unknown>;
type LaunchBasics = {
  projectName: string;
  idea: string;
  entityType: string;
  sector: string;
  city: string;
  targetAudience: string;
  initialCapital: number;
  durationMonths: number;
  teamSize: number;
};
type BudgetAllocation = {
  category: string;
  amount: number;
};
type LaunchBudget = {
  totalBudget: number;
  contingencyPercent: number;
  expectedMonthlyRevenue?: number;
  expectedMonthlyOperatingCosts?: number;
  allocations: BudgetAllocation[];
};
type TeamRole = {
  roleName: string;
  responsibilities: string;
  requiredCount: number;
};
type LaunchMilestone = {
  type: string;
  startDate: string;
  endDate: string;
  status: string;
};
type LaunchTask = {
  id: string;
  title: string;
  status: string;
  dueDate?: string;
  assigneeUserId?: string;
};
type LaunchPlan = {
  basics?: LaunchBasics;
  budget?: LaunchBudget;
  roles: TeamRole[];
  timeline?: {
    startDate: string;
    targetLaunchDate: string;
    milestones: LaunchMilestone[];
  };
  tasks: LaunchTask[];
};
type StartProject = {
  id: string;
  name: string;
  description?: string | null;
  sector?: string | null;
  countryCode?: string | null;
  currency: string;
  status: string;
  currentPhase: string;
  launchPlan?: unknown;
  launchPlanUpdatedAt?: string | null;
  phases: Array<{
    id: string;
    type: string;
    title: string;
    sequence: number;
    status: string;
  }>;
  decisions: Array<{
    id: string;
    verdict: string;
    rationale: string;
    weightedScore?: number | null;
  }>;
  complianceItems: Array<{
    id: string;
    kind: string;
    title: string;
    authority?: string | null;
    status: string;
    reference?: string | null;
    dueAt?: string | null;
    notes?: string | null;
  }>;
  vendors: Array<{
    id: string;
    kind: string;
    name: string;
    category?: string | null;
    contactEmail?: string | null;
    status: string;
    notes?: string | null;
  }>;
  members: Array<{
    id: string;
    role: string;
    user: {
      id: string;
      email: string;
      profile?: { displayName?: string | null } | null;
    };
  }>;
  risks: Array<{
    id: string;
    title: string;
    score: number;
    status: string;
  }>;
  financialPlans: Array<{ id: string }>;
};

const budgetCategories = [
  {
    id: "FOUNDATION",
    icon: "building" as const,
    label: ["التأسيس والتراخيص", "Foundation and licenses"],
    color: "#1da5ff",
  },
  {
    id: "EQUIPMENT",
    icon: "settings" as const,
    label: ["التجهيز", "Equipment"],
    color: "#8b5ee8",
  },
  {
    id: "MARKETING",
    icon: "megaphone" as const,
    label: ["التسويق", "Marketing"],
    color: "#13d5df",
  },
  {
    id: "PEOPLE",
    icon: "people" as const,
    label: ["الموارد البشرية", "People"],
    color: "#e6ad48",
  },
  {
    id: "SYSTEMS",
    icon: "grid" as const,
    label: ["الأنظمة", "Systems"],
    color: "#2dd397",
  },
  {
    id: "CONTINGENCY",
    icon: "shield" as const,
    label: ["الطوارئ", "Contingency"],
    color: "#ef5c78",
  },
] as const;

const milestoneTypes = [
  { id: "LICENSES", label: ["التراخيص والموافقات", "Licenses and approvals"] },
  { id: "SETUP", label: ["التجهيزات والبنية", "Setup and infrastructure"] },
  { id: "VENDORS", label: ["التوريد والموردون", "Procurement and vendors"] },
  { id: "TEAM", label: ["بناء الفريق", "Team building"] },
  { id: "PILOT", label: ["التشغيل التجريبي", "Pilot operation"] },
  { id: "LAUNCH", label: ["الإطلاق الرسمي", "Official launch"] },
] as const;

const statusLabels: Record<string, readonly [string, string]> = {
  REQUIRED: ["مطلوب", "Required"],
  IN_PROGRESS: ["قيد التنفيذ", "In progress"],
  SUBMITTED: ["مقدم للمراجعة", "Submitted"],
  APPROVED: ["مكتمل", "Approved"],
  REJECTED: ["مرفوض", "Rejected"],
  NOT_APPLICABLE: ["غير مطلوب", "Not applicable"],
  PROSPECT: ["قيد التواصل", "Prospect"],
  ACTIVE: ["نشط", "Active"],
  SUSPENDED: ["موقوف", "Suspended"],
  ARCHIVED: ["مؤرشف", "Archived"],
  PENDING: ["لم يبدأ", "Pending"],
  COMPLETED: ["مكتمل", "Completed"],
  BLOCKED: ["متوقف", "Blocked"],
  NOT_STARTED: ["لم يبدأ", "Not started"],
  TODO: ["لم يبدأ", "To do"],
  DONE: ["مكتمل", "Done"],
};

function t(ar: boolean, arabic: string, english: string) {
  return ar ? arabic : english;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function readLaunchPlan(value: unknown): LaunchPlan {
  const plan = asRecord(value);
  const sections = asRecord(plan?.sections);
  const basics = asRecord(sections?.BASICS);
  const budget = asRecord(sections?.BUDGET);
  const team = asRecord(sections?.TEAM);
  const timeline = asRecord(sections?.TIMELINE);
  const tasks = asRecord(sections?.TASKS);
  return {
    basics:
      basics &&
      typeof basics.projectName === "string" &&
      typeof basics.idea === "string"
        ? (basics as LaunchBasics)
        : undefined,
    budget:
      budget &&
      typeof budget.totalBudget === "number" &&
      Array.isArray(budget.allocations)
        ? (budget as LaunchBudget)
        : undefined,
    roles: Array.isArray(team?.roles) ? (team.roles as TeamRole[]) : [],
    timeline:
      timeline &&
      typeof timeline.startDate === "string" &&
      Array.isArray(timeline.milestones)
        ? (timeline as LaunchPlan["timeline"])
        : undefined,
    tasks: Array.isArray(tasks?.tasks) ? (tasks.tasks as LaunchTask[]) : [],
  };
}

function labelFor(value: string, ar: boolean) {
  const label = statusLabels[value];
  return label ? t(ar, ...label) : value;
}

function formatNumber(value: number | undefined, locale: Locale) {
  if (value === undefined || !Number.isFinite(value))
    return locale === "ar" ? "غير متاح" : "Unavailable";
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return locale === "ar" ? "غير محدد" : "Not set";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

async function apiRequest<T>(body: Record<string, unknown>) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: T;
    message?: string;
  } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message ?? "Project request failed");
  }
  return payload.result as T;
}

async function listProjects() {
  const response = await fetch("/api/projects?limit=100&offset=0", {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    projects?: StartProject[];
    message?: string;
  } | null;
  if (!response.ok || !payload?.success || !payload.projects) {
    throw new Error(payload?.message ?? "Projects could not be loaded");
  }
  return payload.projects;
}

function StartNavigation({
  activeRoute,
  ar,
  projectId,
}: {
  activeRoute: string;
  ar: boolean;
  projectId?: string;
}) {
  const items = [
    {
      route: "/projects/start",
      icon: "dashboard" as const,
      label: ["لوحة البداية", "Dashboard"],
    },
    {
      route: "/projects/start/evaluation",
      icon: "barChart" as const,
      label: ["التقييم", "Evaluation"],
    },
    {
      route: "/projects/start/new",
      icon: "briefcase" as const,
      label: ["بيانات المشروع", "Project data"],
    },
    {
      route: "/projects/start/licenses",
      icon: "mail" as const,
      label: ["التراخيص", "Licenses"],
    },
    {
      route: "/projects/start/team",
      icon: "people" as const,
      label: ["الفريق", "Team"],
    },
    {
      route: "/projects/start/setup",
      icon: "wallet" as const,
      label: ["الميزانية", "Budget"],
    },
    {
      route: "/projects/start/vendors",
      icon: "building" as const,
      label: ["الموردون", "Vendors"],
    },
    {
      route: "/projects/start/roadmap",
      icon: "activity" as const,
      label: ["الجدول الزمني", "Timeline"],
    },
    {
      route: "/projects/start/launch",
      icon: "rocket" as const,
      label: ["الإطلاق", "Launch"],
    },
  ];
  return (
    <nav
      className="psw-navigation"
      aria-label={t(ar, "مسارات بدء المشروع", "Start project routes")}
    >
      {items.map((item) => (
        <Link
          className={activeRoute === item.route ? "is-active" : ""}
          href={`${item.route}${projectId ? `?project=${projectId}` : ""}`}
          key={item.route}
        >
          <Icon name={item.icon} />
          <span>{t(ar, item.label[0], item.label[1])}</span>
        </Link>
      ))}
    </nav>
  );
}

function ProjectSelector({
  ar,
  onChange,
  projects,
  selectedId,
}: {
  ar: boolean;
  onChange: (id: string) => void;
  projects: StartProject[];
  selectedId: string;
}) {
  return (
    <div className="psw-project-selector">
      <label>
        <span>{t(ar, "المشروع الحالي", "Current project")}</span>
        <select
          value={selectedId}
          onChange={(event) => onChange(event.target.value)}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <Link href="/projects/start/new?new=1">
        <Icon name="plus" />
        {t(ar, "مشروع جديد", "New project")}
      </Link>
    </div>
  );
}

function PageHeading({
  actions,
  ar,
  eyebrow,
  note,
  title,
}: {
  actions?: ReactNode;
  ar: boolean;
  eyebrow: readonly [string, string];
  note: readonly [string, string];
  title: readonly [string, string];
}) {
  return (
    <header className="psw-page-heading">
      <div>
        <span>{t(ar, ...eyebrow)}</span>
        <h1>{t(ar, ...title)}</h1>
        <p>{t(ar, ...note)}</p>
      </div>
      {actions}
    </header>
  );
}

function readinessSignals(project: StartProject, plan: LaunchPlan) {
  const unresolvedCompliance = project.complianceItems.filter(
    (item) => !["APPROVED", "NOT_APPLICABLE"].includes(item.status),
  );
  const planningPhase = project.phases.find(
    (phase) => phase.type === "PLANNING",
  );
  return [
    {
      id: "basics",
      done: Boolean(plan.basics),
      label: ["بيانات المشروع مكتملة", "Project data completed"] as const,
    },
    {
      id: "licenses",
      done:
        project.complianceItems.length > 0 && unresolvedCompliance.length === 0,
      label: [
        "التراخيص والإجراءات محسومة",
        "Licenses and procedures resolved",
      ] as const,
    },
    {
      id: "budget",
      done: Boolean(plan.budget),
      label: ["الميزانية معتمدة", "Budget saved"] as const,
    },
    {
      id: "team",
      done: plan.roles.length > 0,
      label: ["احتياجات الفريق محددة", "Team requirements defined"] as const,
    },
    {
      id: "vendors",
      done: project.vendors.some((vendor) =>
        ["APPROVED", "ACTIVE"].includes(vendor.status),
      ),
      label: ["مورد أو شريك معتمد", "Vendor or partner approved"] as const,
    },
    {
      id: "timeline",
      done: Boolean(plan.timeline),
      label: ["الجدول الزمني محفوظ", "Timeline saved"] as const,
    },
    {
      id: "evaluation",
      done: project.decisions[0]?.verdict === "APPROVE",
      label: ["قرار التقييم معتمد", "Evaluation approved"] as const,
    },
    {
      id: "planning",
      done: planningPhase?.status === "COMPLETED",
      label: ["مرحلة التخطيط مكتملة", "Planning phase completed"] as const,
    },
  ];
}

function DashboardScreen({
  ar,
  locale,
  plan,
  project,
}: {
  ar: boolean;
  locale: Locale;
  plan: LaunchPlan;
  project: StartProject;
}) {
  const signals = readinessSignals(project, plan);
  const complete = signals.filter((item) => item.done).length;
  const score = Math.round((complete / signals.length) * 100);
  const taskDone = plan.tasks.filter((task) => task.status === "DONE").length;
  const taskDoing = plan.tasks.filter(
    (task) => task.status === "IN_PROGRESS",
  ).length;
  const taskPending = plan.tasks.length - taskDone - taskDoing;
  const timeline = project.phases.slice(3);
  return (
    <section className="psw-dashboard" data-testid="start-dashboard">
      <div className="psw-dashboard-hero">
        <div>
          <span>
            {t(
              ar,
              "حوّل فكرتك إلى مشروع حقيقي",
              "Turn your idea into a real project",
            )}
          </span>
          <h1>{project.name}</h1>
          <p>
            {project.description ??
              t(
                ar,
                "لا يوجد وصف محفوظ للمشروع.",
                "No project description is saved.",
              )}
          </p>
        </div>
        <aside>
          <Icon name="rocket" />
          <small>{t(ar, "الحالة الحالية", "Current status")}</small>
          <strong>{labelFor(project.status, ar)}</strong>
        </aside>
      </div>
      <div className="psw-dashboard-grid">
        <article className="psw-readiness-card">
          <header>
            <Icon name="barChart" />
            <h2>{t(ar, "جاهزية المشروع", "Project readiness")}</h2>
          </header>
          <div>
            <span
              className="psw-score-ring"
              style={{ "--psw-score": `${score * 3.6}deg` } as CSSProperties}
            >
              <b>{score}%</b>
              <small>{t(ar, "جاهز للإطلاق", "Launch readiness")}</small>
            </span>
            <ul>
              <li>
                <i className="is-complete" />
                {complete} {t(ar, "مكتمل", "complete")}
              </li>
              <li>
                <i className="is-progress" />
                {signals.length - complete} {t(ar, "متبقٍ", "remaining")}
              </li>
            </ul>
          </div>
        </article>
        <article className="psw-quick-actions">
          <header>
            <Icon name="activity" />
            <h2>{t(ar, "إجراءات سريعة", "Quick actions")}</h2>
          </header>
          <div>
            <Link href={`/projects/start/new?project=${project.id}`}>
              <Icon name="briefcase" />
              <span>
                {t(ar, "إكمال بيانات المشروع", "Complete project data")}
              </span>
              <Icon name="arrow" />
            </Link>
            <Link href={`/projects/start/team?project=${project.id}`}>
              <Icon name="people" />
              <span>{t(ar, "بناء الفريق", "Build the team")}</span>
              <Icon name="arrow" />
            </Link>
            <Link href={`/projects/start/setup?project=${project.id}`}>
              <Icon name="wallet" />
              <span>{t(ar, "تحديد الميزانية", "Define budget")}</span>
              <Icon name="arrow" />
            </Link>
            <Link href={`/projects/start/roadmap?project=${project.id}`}>
              <Icon name="activity" />
              <span>{t(ar, "إنشاء الجدول الزمني", "Create timeline")}</span>
              <Icon name="arrow" />
            </Link>
          </div>
        </article>
        <article className="psw-indicators">
          <header>
            <Icon name="barChart" />
            <h2>{t(ar, "أهم المؤشرات", "Key indicators")}</h2>
          </header>
          <div>
            <span>
              <Icon name="check" />
              <b>
                {
                  project.complianceItems.filter(
                    (item) => item.status === "APPROVED",
                  ).length
                }
              </b>
              <small>{t(ar, "تراخيص مكتملة", "Approved licenses")}</small>
            </span>
            <span>
              <Icon name="people" />
              <b>{project.members.length}</b>
              <small>{t(ar, "أعضاء", "Members")}</small>
            </span>
            <span>
              <Icon name="building" />
              <b>{project.vendors.length}</b>
              <small>{t(ar, "موردون وشركاء", "Vendors and partners")}</small>
            </span>
            <span>
              <Icon name="activity" />
              <b>{plan.tasks.length}</b>
              <small>{t(ar, "مهام", "Tasks")}</small>
            </span>
          </div>
        </article>
        <article className="psw-main-stages">
          <header>
            <Icon name="rocket" />
            <h2>{t(ar, "المراحل الرئيسية", "Main stages")}</h2>
          </header>
          <div>
            {timeline.map((phase, index) => (
              <span
                className={
                  phase.status === "COMPLETED"
                    ? "is-complete"
                    : phase.status === "ACTIVE"
                      ? "is-active"
                      : ""
                }
                key={phase.id}
              >
                <i>
                  {phase.status === "COMPLETED" ? (
                    <Icon name="check" />
                  ) : (
                    index + 1
                  )}
                </i>
                <b>{phase.title}</b>
                <small>{labelFor(phase.status, ar)}</small>
              </span>
            ))}
          </div>
        </article>
        <article className="psw-checklist">
          <header>
            <Icon name="check" />
            <h2>{t(ar, "قائمة الانطلاق السريع", "Launch checklist")}</h2>
          </header>
          <ul>
            {signals.map((signal) => (
              <li className={signal.done ? "is-done" : ""} key={signal.id}>
                <Icon name={signal.done ? "check" : "activity"} />
                <span>{t(ar, signal.label[0], signal.label[1])}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="psw-task-summary">
          <header>
            <Icon name="activity" />
            <h2>{t(ar, "المهام المسجلة", "Saved tasks")}</h2>
          </header>
          {plan.tasks.length ? (
            <>
              <div>
                <span>
                  <b>{taskDone}</b>
                  {t(ar, "مكتملة", "Done")}
                </span>
                <span>
                  <b>{taskDoing}</b>
                  {t(ar, "قيد التنفيذ", "In progress")}
                </span>
                <span>
                  <b>{taskPending}</b>
                  {t(ar, "متبقية", "Pending")}
                </span>
              </div>
              <ul>
                {plan.tasks.slice(0, 5).map((task) => (
                  <li key={task.id}>
                    <i className={`tone-${task.status.toLowerCase()}`} />
                    {task.title}
                    <small>{labelFor(task.status, ar)}</small>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              {t(
                ar,
                "لم تُضف مهام مخصصة بعد. تظهر متطلبات الإطلاق في القائمة المجاورة.",
                "No custom tasks have been added. Launch requirements appear in the adjacent checklist.",
              )}
            </p>
          )}
        </article>
        <article className="psw-budget-summary">
          <header>
            <Icon name="wallet" />
            <h2>{t(ar, "ملخص الميزانية", "Budget summary")}</h2>
          </header>
          <strong>
            {formatNumber(
              plan.budget?.totalBudget ?? plan.basics?.initialCapital,
              locale,
            )}{" "}
            <small>{project.currency}</small>
          </strong>
          <p>
            {plan.budget
              ? t(
                  ar,
                  `تم توزيع ${formatNumber(
                    plan.budget.allocations.reduce(
                      (sum, item) => sum + item.amount,
                      0,
                    ),
                    locale,
                  )} من الميزانية.`,
                  `${formatNumber(
                    plan.budget.allocations.reduce(
                      (sum, item) => sum + item.amount,
                      0,
                    ),
                    locale,
                  )} of the budget is allocated.`,
                )
              : t(
                  ar,
                  "احفظ توزيع الميزانية لعرض التفاصيل.",
                  "Save a budget allocation to see details.",
                )}
          </p>
        </article>
      </div>
    </section>
  );
}

function BasicsScreen({
  ar,
  busy,
  locale,
  onSaved,
  project,
}: {
  ar: boolean;
  busy: boolean;
  locale: Locale;
  onSaved: (projectId: string) => Promise<void>;
  project?: StartProject;
}) {
  const plan = readLaunchPlan(project?.launchPlan);
  const initial = plan.basics;
  const [projectName, setProjectName] = useState(
    initial?.projectName ?? project?.name ?? "",
  );
  const [idea, setIdea] = useState(initial?.idea ?? project?.description ?? "");
  const [entityType, setEntityType] = useState(initial?.entityType ?? "");
  const [sector, setSector] = useState(
    initial?.sector ?? project?.sector ?? "",
  );
  const [city, setCity] = useState(initial?.city ?? "");
  const [targetAudience, setTargetAudience] = useState(
    initial?.targetAudience ?? "",
  );
  const [initialCapital, setInitialCapital] = useState(
    String(initial?.initialCapital ?? ""),
  );
  const [durationMonths, setDurationMonths] = useState(
    String(initial?.durationMonths ?? ""),
  );
  const [teamSize, setTeamSize] = useState(String(initial?.teamSize ?? ""));
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      let projectId = project?.id;
      if (!projectId) {
        const created = await apiRequest<{ id: string }>({
          action: "create",
          name: projectName,
          description: idea,
          sector,
          countryCode: "SA",
          currency: "SAR",
        });
        projectId = created.id;
      }
      await apiRequest({
        action: "saveProjectLaunchPlan",
        projectId,
        payload: {
          section: "BASICS",
          data: {
            projectName,
            idea,
            entityType,
            sector,
            city,
            targetAudience,
            initialCapital: Number(initialCapital),
            durationMonths: Number(durationMonths),
            teamSize: Number(teamSize),
          },
        },
      });
      await onSaved(projectId);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t(ar, "تعذر حفظ البيانات.", "Data could not be saved."),
      );
    }
  }

  const completed = [
    projectName,
    idea,
    entityType,
    sector,
    city,
    targetAudience,
    initialCapital,
    durationMonths,
    teamSize,
  ].filter(Boolean).length;
  return (
    <section className="psw-page psw-basics" data-testid="start-data">
      <PageHeading
        ar={ar}
        eyebrow={["بدء مشروع", "Start project"]}
        title={["بيانات المشروع", "Project data"]}
        note={[
          "أدخل المعلومات الأساسية اللازمة لبناء خطة إطلاق قابلة للتنفيذ.",
          "Enter the core information required for an actionable launch plan.",
        ]}
      />
      <div className="psw-form-layout">
        <form className="psw-panel psw-basics-form" onSubmit={submit}>
          <header>
            <Icon name="briefcase" />
            <h2>{t(ar, "المعلومات الأساسية", "Core information")}</h2>
            <small>{completed}/9</small>
          </header>
          <div className="psw-fields">
            <label>
              <span>{t(ar, "اسم المشروع", "Project name")} *</span>
              <input
                required
                minLength={2}
                maxLength={160}
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </label>
            <label className="is-wide">
              <span>{t(ar, "فكرة المشروع", "Project idea")} *</span>
              <textarea
                required
                minLength={10}
                maxLength={4000}
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
              />
            </label>
            <label>
              <span>{t(ar, "نوع الكيان", "Entity type")} *</span>
              <select
                required
                value={entityType}
                onChange={(event) => setEntityType(event.target.value)}
              >
                <option value="">{t(ar, "اختر النوع", "Select type")}</option>
                <option value="LLC">
                  {t(
                    ar,
                    "شركة ذات مسؤولية محدودة",
                    "Limited liability company",
                  )}
                </option>
                <option value="SOLE_PROPRIETORSHIP">
                  {t(ar, "مؤسسة فردية", "Sole proprietorship")}
                </option>
                <option value="JOINT_STOCK">
                  {t(ar, "شركة مساهمة", "Joint-stock company")}
                </option>
                <option value="NONPROFIT">
                  {t(ar, "كيان غير ربحي", "Nonprofit entity")}
                </option>
                <option value="OTHER">{t(ar, "نوع آخر", "Other")}</option>
              </select>
            </label>
            <label>
              <span>{t(ar, "القطاع", "Sector")} *</span>
              <input
                required
                minLength={2}
                maxLength={120}
                value={sector}
                onChange={(event) => setSector(event.target.value)}
              />
            </label>
            <label>
              <span>{t(ar, "المدينة", "City")} *</span>
              <select
                required
                value={city}
                onChange={(event) => setCity(event.target.value)}
              >
                <option value="">{t(ar, "اختر المدينة", "Select city")}</option>
                <option value="Riyadh">{t(ar, "الرياض", "Riyadh")}</option>
                <option value="Jeddah">{t(ar, "جدة", "Jeddah")}</option>
                <option value="Dammam">{t(ar, "الدمام", "Dammam")}</option>
                <option value="Makkah">{t(ar, "مكة", "Makkah")}</option>
                <option value="Madinah">{t(ar, "المدينة", "Madinah")}</option>
              </select>
            </label>
            <label>
              <span>{t(ar, "الفئة المستهدفة", "Target audience")} *</span>
              <input
                required
                minLength={2}
                maxLength={500}
                value={targetAudience}
                onChange={(event) => setTargetAudience(event.target.value)}
              />
            </label>
            <label>
              <span>{t(ar, "رأس المال المبدئي", "Initial capital")} *</span>
              <input
                required
                min="1"
                type="number"
                value={initialCapital}
                onChange={(event) => setInitialCapital(event.target.value)}
              />
            </label>
            <label>
              <span>
                {t(ar, "مدة التنفيذ بالأشهر", "Duration in months")} *
              </span>
              <input
                required
                min="1"
                max="120"
                type="number"
                value={durationMonths}
                onChange={(event) => setDurationMonths(event.target.value)}
              />
            </label>
            <label>
              <span>{t(ar, "حجم الفريق", "Team size")} *</span>
              <input
                required
                min="1"
                max="10000"
                type="number"
                value={teamSize}
                onChange={(event) => setTeamSize(event.target.value)}
              />
            </label>
          </div>
          {message ? (
            <p className="psw-message" role="alert">
              {message}
            </p>
          ) : null}
          <footer>
            <Link className="psw-secondary-button" href="/projects/start">
              {t(ar, "إلغاء", "Cancel")}
            </Link>
            <button
              className="psw-primary-button"
              disabled={busy}
              type="submit"
            >
              <Icon name="arrow" />
              {t(ar, "حفظ ومتابعة", "Save and continue")}
            </button>
          </footer>
        </form>
        <aside className="psw-form-aside">
          <article>
            <Icon name="barChart" />
            <span>{t(ar, "جاهزية البيانات", "Data readiness")}</span>
            <strong>{Math.round((completed / 9) * 100)}%</strong>
            <div>
              <i style={{ width: `${(completed / 9) * 100}%` }} />
            </div>
          </article>
          <article>
            <Icon name="check" />
            <h2>{t(ar, "قائمة التحقق", "Validation checklist")}</h2>
            <ul>
              {[
                [projectName, "اسم المشروع", "Project name"],
                [idea, "فكرة المشروع", "Project idea"],
                [entityType, "نوع الكيان", "Entity type"],
                [sector, "القطاع", "Sector"],
                [city, "المدينة", "City"],
                [initialCapital, "رأس المال", "Capital"],
                [durationMonths, "مدة التنفيذ", "Duration"],
                [targetAudience, "الفئة المستهدفة", "Audience"],
              ].map(([value, arabic, english]) => (
                <li className={value ? "is-done" : ""} key={arabic}>
                  <Icon name={value ? "check" : "activity"} />
                  {t(ar, arabic, english)}
                </li>
              ))}
            </ul>
          </article>
          <article>
            <Icon name="shield" />
            <p>
              {t(
                ar,
                `جميع القيم تحفظ بعملة ${project?.currency ?? "SAR"}، ولا تُنشأ تقديرات مالية تلقائية دون مدخلاتك.`,
                `All values are stored in ${project?.currency ?? "SAR"}; no financial estimates are created without your input.`,
              )}
            </p>
          </article>
        </aside>
      </div>
      <span className="psw-locale-marker" data-locale={locale} />
    </section>
  );
}

function LicensesScreen({
  ar,
  onRun,
  project,
}: {
  ar: boolean;
  onRun: (body: Record<string, unknown>, message: string) => Promise<void>;
  project: StartProject;
}) {
  const [title, setTitle] = useState("");
  const [authority, setAuthority] = useState("");
  const [kind, setKind] = useState("LICENSE");
  const [dueAt, setDueAt] = useState("");
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onRun(
      {
        action: "createCompliance",
        projectId: project.id,
        title,
        authority: authority || undefined,
        kind,
        dueAt: dueAt ? new Date(`${dueAt}T12:00:00Z`).toISOString() : undefined,
      },
      t(ar, "تمت إضافة المتطلب.", "Requirement added."),
    );
    setTitle("");
    setAuthority("");
    setDueAt("");
  }
  const approved = project.complianceItems.filter(
    (item) => item.status === "APPROVED",
  ).length;
  const percent = project.complianceItems.length
    ? Math.round((approved / project.complianceItems.length) * 100)
    : 0;
  return (
    <section className="psw-page" data-testid="start-licenses">
      <PageHeading
        ar={ar}
        eyebrow={["بدء مشروع", "Start project"]}
        title={["التراخيص والموافقات", "Licenses and approvals"]}
        note={[
          "أدر المتطلبات الحكومية الحقيقية وحالتها ومواعيدها ومستنداتها من سجل المشروع.",
          "Manage actual government requirements, statuses, due dates, and references from the project record.",
        ]}
        actions={
          <a
            className="psw-secondary-button"
            href={`/api/projects/${project.id}/report`}
          >
            <Icon name="briefcase" />
            {t(ar, "طباعة القائمة", "Print checklist")}
          </a>
        }
      />
      <div className="psw-license-summary">
        <article>
          <span
            className="psw-score-ring"
            style={{ "--psw-score": `${percent * 3.6}deg` } as CSSProperties}
          >
            <b>{percent}%</b>
            <small>{t(ar, "مكتمل", "Complete")}</small>
          </span>
          <div>
            <b>{approved}</b>
            <small>{t(ar, "مكتمل", "Approved")}</small>
            <b>
              {
                project.complianceItems.filter(
                  (item) =>
                    item.status === "IN_PROGRESS" ||
                    item.status === "SUBMITTED",
                ).length
              }
            </b>
            <small>{t(ar, "قيد المراجعة", "Under review")}</small>
            <b>
              {
                project.complianceItems.filter(
                  (item) => item.status === "REQUIRED",
                ).length
              }
            </b>
            <small>{t(ar, "مطلوب", "Required")}</small>
          </div>
        </article>
        <form onSubmit={add}>
          <h2>{t(ar, "إضافة ترخيص أو إجراء", "Add license or procedure")}</h2>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="LICENSE">{t(ar, "ترخيص", "License")}</option>
            <option value="PROCEDURE">{t(ar, "إجراء", "Procedure")}</option>
          </select>
          <input
            required
            minLength={2}
            maxLength={240}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t(ar, "اسم المتطلب", "Requirement title")}
          />
          <input
            maxLength={240}
            value={authority}
            onChange={(event) => setAuthority(event.target.value)}
            placeholder={t(ar, "الجهة الحكومية", "Authority")}
          />
          <input
            type="date"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
          <button className="psw-primary-button" type="submit">
            <Icon name="plus" />
            {t(ar, "إضافة", "Add")}
          </button>
        </form>
      </div>
      <div className="psw-panel psw-data-table">
        <header>
          <Icon name="mail" />
          <h2>
            {t(ar, "قائمة التراخيص والموافقات", "Licenses and approvals")}
          </h2>
          <span>{project.complianceItems.length}</span>
        </header>
        <div className="psw-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t(ar, "الترخيص / الموافقة", "Requirement")}</th>
                <th>{t(ar, "الجهة", "Authority")}</th>
                <th>{t(ar, "الحالة", "Status")}</th>
                <th>{t(ar, "الموعد", "Due date")}</th>
                <th>{t(ar, "الإجراء", "Action")}</th>
              </tr>
            </thead>
            <tbody>
              {project.complianceItems.length ? (
                project.complianceItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <b>{item.title}</b>
                      <small>{item.kind}</small>
                    </td>
                    <td>{item.authority ?? "—"}</td>
                    <td>
                      <span
                        className={`psw-status tone-${item.status.toLowerCase()}`}
                      >
                        {labelFor(item.status, ar)}
                      </span>
                    </td>
                    <td>{formatDate(item.dueAt, ar ? "ar" : "en")}</td>
                    <td>
                      <select
                        value={item.status}
                        onChange={(event) =>
                          void onRun(
                            {
                              action: "updateComplianceStatus",
                              projectId: project.id,
                              itemId: item.id,
                              status: event.target.value,
                            },
                            t(ar, "تم تحديث الحالة.", "Status updated."),
                          )
                        }
                      >
                        <option value="REQUIRED">
                          {labelFor("REQUIRED", ar)}
                        </option>
                        <option value="IN_PROGRESS">
                          {labelFor("IN_PROGRESS", ar)}
                        </option>
                        <option value="SUBMITTED">
                          {labelFor("SUBMITTED", ar)}
                        </option>
                        <option value="APPROVED">
                          {labelFor("APPROVED", ar)}
                        </option>
                        <option value="REJECTED">
                          {labelFor("REJECTED", ar)}
                        </option>
                        <option value="NOT_APPLICABLE">
                          {labelFor("NOT_APPLICABLE", ar)}
                        </option>
                      </select>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    {t(
                      ar,
                      "لا توجد متطلبات مسجلة. أضف المتطلبات الفعلية للمشروع.",
                      "No requirements are recorded. Add the project's actual requirements.",
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function BudgetScreen({
  ar,
  locale,
  onSaved,
  plan,
  project,
}: {
  ar: boolean;
  locale: Locale;
  onSaved: () => Promise<void>;
  plan: LaunchPlan;
  project: StartProject;
}) {
  const initialTotal =
    plan.budget?.totalBudget ?? plan.basics?.initialCapital ?? 0;
  const [total, setTotal] = useState(String(initialTotal || ""));
  const [contingency, setContingency] = useState(
    String(plan.budget?.contingencyPercent ?? 10),
  );
  const [revenue, setRevenue] = useState(
    String(plan.budget?.expectedMonthlyRevenue ?? ""),
  );
  const [costs, setCosts] = useState(
    String(plan.budget?.expectedMonthlyOperatingCosts ?? ""),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      budgetCategories.map((category) => [
        category.id,
        String(
          plan.budget?.allocations.find((item) => item.category === category.id)
            ?.amount ?? "",
        ),
      ]),
    ),
  );
  const [message, setMessage] = useState("");
  const allocated = Object.values(amounts).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  const totalValue = Number(total) || 0;
  const monthlyMargin =
    revenue && costs ? Number(revenue) - Number(costs) : undefined;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      await apiRequest({
        action: "saveProjectLaunchPlan",
        projectId: project.id,
        payload: {
          section: "BUDGET",
          data: {
            totalBudget: totalValue,
            contingencyPercent: Number(contingency),
            ...(revenue ? { expectedMonthlyRevenue: Number(revenue) } : {}),
            ...(costs ? { expectedMonthlyOperatingCosts: Number(costs) } : {}),
            allocations: budgetCategories.map((category) => ({
              category: category.id,
              amount: Number(amounts[category.id]) || 0,
            })),
          },
        },
      });
      await onSaved();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t(ar, "تعذر حفظ الميزانية.", "Budget could not be saved."),
      );
    }
  }
  return (
    <section className="psw-page" data-testid="start-budget">
      <PageHeading
        ar={ar}
        eyebrow={["بدء مشروع", "Start project"]}
        title={["الميزانية والموارد", "Budget and resources"]}
        note={[
          "وزع رأس المال على بنود حقيقية؛ تُحسب النسب والهامش من مدخلاتك فقط.",
          "Allocate real capital; percentages and margins are calculated only from your input.",
        ]}
      />
      <form className="psw-budget-layout" onSubmit={save}>
        <div className="psw-panel psw-budget-editor">
          <header>
            <Icon name="barChart" />
            <h2>{t(ar, "توزيع الميزانية حسب البنود", "Budget allocation")}</h2>
          </header>
          <div className="psw-budget-total">
            <label>
              {t(ar, "إجمالي الميزانية", "Total budget")}
              <input
                required
                min="1"
                type="number"
                value={total}
                onChange={(event) => setTotal(event.target.value)}
              />
            </label>
            <label>
              {t(ar, "نسبة الاحتياطي", "Contingency percent")}
              <input
                required
                min="0"
                max="100"
                type="number"
                value={contingency}
                onChange={(event) => setContingency(event.target.value)}
              />
            </label>
          </div>
          <div className="psw-allocation-list">
            {budgetCategories.map((category) => {
              const amount = Number(amounts[category.id]) || 0;
              const percentage =
                totalValue > 0 ? (amount / totalValue) * 100 : 0;
              return (
                <label key={category.id}>
                  <Icon name={category.icon} />
                  <span style={{ color: category.color }}>
                    {t(ar, category.label[0], category.label[1])}
                  </span>
                  <input
                    min="0"
                    type="number"
                    value={amounts[category.id]}
                    onChange={(event) =>
                      setAmounts((current) => ({
                        ...current,
                        [category.id]: event.target.value,
                      }))
                    }
                  />
                  <b>{percentage.toFixed(1)}%</b>
                </label>
              );
            })}
          </div>
          <div className="psw-budget-forecast">
            <label>
              {t(
                ar,
                "الإيراد الشهري المتوقع (اختياري)",
                "Expected monthly revenue (optional)",
              )}
              <input
                min="0"
                type="number"
                value={revenue}
                onChange={(event) => setRevenue(event.target.value)}
              />
            </label>
            <label>
              {t(
                ar,
                "التكاليف التشغيلية الشهرية (اختياري)",
                "Monthly operating costs (optional)",
              )}
              <input
                min="0"
                type="number"
                value={costs}
                onChange={(event) => setCosts(event.target.value)}
              />
            </label>
          </div>
          {message ? (
            <p className="psw-message" role="alert">
              {message}
            </p>
          ) : null}
          <footer>
            <button className="psw-primary-button" type="submit">
              <Icon name="check" />
              {t(ar, "اعتماد الميزانية", "Save budget")}
            </button>
          </footer>
        </div>
        <aside className="psw-budget-aside">
          <article>
            <Icon name="wallet" />
            <span>{t(ar, "إجمالي الميزانية", "Total budget")}</span>
            <strong>
              {formatNumber(totalValue, locale)}{" "}
              <small>{project.currency}</small>
            </strong>
          </article>
          <article>
            <Icon name="barChart" />
            <span>{t(ar, "المبلغ الموزع", "Allocated amount")}</span>
            <strong>
              {formatNumber(allocated, locale)}{" "}
              <small>{project.currency}</small>
            </strong>
            <div>
              <i
                style={{
                  width: `${Math.min(totalValue ? (allocated / totalValue) * 100 : 0, 100)}%`,
                }}
              />
            </div>
          </article>
          <article>
            <Icon name="shield" />
            <span>{t(ar, "المتبقي غير الموزع", "Unallocated balance")}</span>
            <strong className={allocated > totalValue ? "is-danger" : ""}>
              {formatNumber(totalValue - allocated, locale)}{" "}
              <small>{project.currency}</small>
            </strong>
          </article>
          <article>
            <Icon name="trend" />
            <span>
              {t(ar, "الهامش الشهري من المدخلات", "Monthly input margin")}
            </span>
            <strong>
              {monthlyMargin === undefined
                ? t(ar, "غير متاح", "Unavailable")
                : `${formatNumber(monthlyMargin, locale)} ${project.currency}`}
            </strong>
          </article>
        </aside>
      </form>
    </section>
  );
}

function TeamVendorsScreen({
  ar,
  mode,
  onRun,
  onSaved,
  plan,
  project,
}: {
  ar: boolean;
  mode: "team" | "vendors";
  onRun: (body: Record<string, unknown>, message: string) => Promise<void>;
  onSaved: () => Promise<void>;
  plan: LaunchPlan;
  project: StartProject;
}) {
  const [email, setEmail] = useState("");
  const [memberRole, setMemberRole] = useState("EDITOR");
  const [roleName, setRoleName] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [requiredCount, setRequiredCount] = useState("1");
  const [vendorName, setVendorName] = useState("");
  const [vendorCategory, setVendorCategory] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorKind, setVendorKind] = useState("VENDOR");
  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onRun(
      { action: "addMember", projectId: project.id, email, role: memberRole },
      t(ar, "تمت إضافة العضو.", "Member added."),
    );
    setEmail("");
  }
  async function addRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiRequest({
      action: "saveProjectLaunchPlan",
      projectId: project.id,
      payload: {
        section: "TEAM",
        data: {
          roles: [
            ...plan.roles,
            {
              roleName,
              responsibilities,
              requiredCount: Number(requiredCount),
            },
          ],
        },
      },
    });
    setRoleName("");
    setResponsibilities("");
    setRequiredCount("1");
    await onSaved();
  }
  async function addVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onRun(
      {
        action: "createVendor",
        projectId: project.id,
        kind: vendorKind,
        name: vendorName,
        category: vendorCategory || undefined,
        contactEmail: vendorEmail || undefined,
      },
      t(ar, "تمت إضافة المورد أو الشريك.", "Vendor or partner added."),
    );
    setVendorName("");
    setVendorCategory("");
    setVendorEmail("");
  }
  return (
    <section
      className="psw-page"
      data-testid={mode === "team" ? "start-team" : "start-vendors"}
    >
      <PageHeading
        ar={ar}
        eyebrow={["بدء مشروع", "Start project"]}
        title={
          mode === "team"
            ? ["الفريق والأدوار", "Team and roles"]
            : ["الموردون والشركاء", "Vendors and partners"]
        }
        note={
          mode === "team"
            ? [
                "أضف مستخدمين مسجلين وحدد احتياجات الأدوار الفعلية للمشروع.",
                "Add registered users and define actual role requirements.",
              ]
            : [
                "سجل الموردين والشركاء وحالة اعتمادهم دون بيانات تجريبية.",
                "Record vendors and partners with real approval states and no sample data.",
              ]
        }
      />
      <nav className="psw-subtabs">
        <Link
          className={mode === "team" ? "is-active" : ""}
          href={`/projects/start/team?project=${project.id}`}
        >
          {t(ar, "الفريق", "Team")}
        </Link>
        <Link
          className={mode === "vendors" ? "is-active" : ""}
          href={`/projects/start/vendors?project=${project.id}`}
        >
          {t(ar, "الموردون والشركاء", "Vendors and partners")}
        </Link>
      </nav>
      {mode === "team" ? (
        <div className="psw-team-layout">
          <div className="psw-team-main">
            <div className="psw-team-actions">
              <form onSubmit={addMember}>
                <h2>{t(ar, "إضافة مستخدم مسجل", "Add registered user")}</h2>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t(ar, "البريد الإلكتروني", "Email")}
                />
                <select
                  value={memberRole}
                  onChange={(event) => setMemberRole(event.target.value)}
                >
                  <option value="EDITOR">EDITOR</option>
                  <option value="REVIEWER">REVIEWER</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
                <button className="psw-primary-button" type="submit">
                  <Icon name="plus" />
                  {t(ar, "إضافة عضو", "Add member")}
                </button>
              </form>
              <form onSubmit={addRole}>
                <h2>{t(ar, "إضافة احتياج وظيفي", "Add role requirement")}</h2>
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={roleName}
                  onChange={(event) => setRoleName(event.target.value)}
                  placeholder={t(ar, "المسمى", "Role name")}
                />
                <input
                  required
                  minLength={3}
                  maxLength={1000}
                  value={responsibilities}
                  onChange={(event) => setResponsibilities(event.target.value)}
                  placeholder={t(ar, "المسؤوليات", "Responsibilities")}
                />
                <input
                  required
                  min="1"
                  max="100"
                  type="number"
                  value={requiredCount}
                  onChange={(event) => setRequiredCount(event.target.value)}
                />
                <button className="psw-secondary-button" type="submit">
                  <Icon name="plus" />
                  {t(ar, "حفظ الاحتياج", "Save role")}
                </button>
              </form>
            </div>
            <div className="psw-panel psw-member-list">
              <header>
                <Icon name="people" />
                <h2>{t(ar, "أعضاء المشروع", "Project members")}</h2>
                <span>{project.members.length}</span>
              </header>
              {project.members.map((member) => (
                <article key={member.id}>
                  <span className="psw-avatar">
                    {(member.user.profile?.displayName ?? member.user.email)
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div>
                    <b>
                      {member.user.profile?.displayName ?? member.user.email}
                    </b>
                    <small>{member.user.email}</small>
                  </div>
                  <strong>{member.role}</strong>
                </article>
              ))}
            </div>
          </div>
          <aside className="psw-panel psw-role-list">
            <header>
              <Icon name="briefcase" />
              <h2>{t(ar, "الأدوار المطلوبة", "Required roles")}</h2>
            </header>
            {plan.roles.length ? (
              plan.roles.map((role, index) => (
                <article key={`${role.roleName}-${index}`}>
                  <Icon name="user" />
                  <div>
                    <b>{role.roleName}</b>
                    <small>{role.responsibilities}</small>
                  </div>
                  <strong>{role.requiredCount}</strong>
                </article>
              ))
            ) : (
              <p>
                {t(
                  ar,
                  "لم تُحفظ احتياجات وظيفية بعد.",
                  "No role requirements are saved.",
                )}
              </p>
            )}
          </aside>
        </div>
      ) : (
        <div className="psw-vendor-layout">
          <form className="psw-panel psw-vendor-form" onSubmit={addVendor}>
            <header>
              <Icon name="building" />
              <h2>{t(ar, "إضافة مورد أو شريك", "Add vendor or partner")}</h2>
            </header>
            <div>
              <select
                value={vendorKind}
                onChange={(event) => setVendorKind(event.target.value)}
              >
                <option value="VENDOR">{t(ar, "مورد", "Vendor")}</option>
                <option value="PARTNER">{t(ar, "شريك", "Partner")}</option>
              </select>
              <input
                required
                minLength={2}
                maxLength={240}
                value={vendorName}
                onChange={(event) => setVendorName(event.target.value)}
                placeholder={t(ar, "الاسم", "Name")}
              />
              <input
                maxLength={160}
                value={vendorCategory}
                onChange={(event) => setVendorCategory(event.target.value)}
                placeholder={t(ar, "الفئة", "Category")}
              />
              <input
                type="email"
                value={vendorEmail}
                onChange={(event) => setVendorEmail(event.target.value)}
                placeholder={t(ar, "البريد الإلكتروني", "Email")}
              />
              <button className="psw-primary-button" type="submit">
                <Icon name="plus" />
                {t(ar, "إضافة", "Add")}
              </button>
            </div>
          </form>
          <div className="psw-panel psw-data-table">
            <header>
              <Icon name="building" />
              <h2>
                {t(ar, "سجل الموردين والشركاء", "Vendor and partner register")}
              </h2>
              <span>{project.vendors.length}</span>
            </header>
            <div className="psw-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t(ar, "الاسم", "Name")}</th>
                    <th>{t(ar, "النوع", "Kind")}</th>
                    <th>{t(ar, "الفئة", "Category")}</th>
                    <th>{t(ar, "التواصل", "Contact")}</th>
                    <th>{t(ar, "الحالة", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {project.vendors.length ? (
                    project.vendors.map((vendor) => (
                      <tr key={vendor.id}>
                        <td>
                          <b>{vendor.name}</b>
                        </td>
                        <td>{vendor.kind}</td>
                        <td>{vendor.category ?? "—"}</td>
                        <td>{vendor.contactEmail ?? "—"}</td>
                        <td>
                          <select
                            value={vendor.status}
                            onChange={(event) =>
                              void onRun(
                                {
                                  action: "updateVendorStatus",
                                  projectId: project.id,
                                  vendorId: vendor.id,
                                  status: event.target.value,
                                },
                                t(ar, "تم تحديث المورد.", "Vendor updated."),
                              )
                            }
                          >
                            <option value="PROSPECT">
                              {labelFor("PROSPECT", ar)}
                            </option>
                            <option value="APPROVED">
                              {labelFor("APPROVED", ar)}
                            </option>
                            <option value="ACTIVE">
                              {labelFor("ACTIVE", ar)}
                            </option>
                            <option value="SUSPENDED">
                              {labelFor("SUSPENDED", ar)}
                            </option>
                            <option value="ARCHIVED">
                              {labelFor("ARCHIVED", ar)}
                            </option>
                          </select>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        {t(
                          ar,
                          "لا توجد سجلات موردين أو شركاء.",
                          "No vendors or partners are recorded.",
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TimelineScreen({
  ar,
  onSaved,
  plan,
  project,
}: {
  ar: boolean;
  onSaved: () => Promise<void>;
  plan: LaunchPlan;
  project: StartProject;
}) {
  const [startDate, setStartDate] = useState(plan.timeline?.startDate ?? "");
  const [targetLaunchDate, setTargetLaunchDate] = useState(
    plan.timeline?.targetLaunchDate ?? "",
  );
  const [milestones, setMilestones] = useState<LaunchMilestone[]>(
    plan.timeline?.milestones ?? [],
  );
  const [message, setMessage] = useState("");
  function generate() {
    if (!startDate || !targetLaunchDate) {
      setMessage(
        t(
          ar,
          "حدد تاريخ البداية والإطلاق أولًا.",
          "Set start and launch dates first.",
        ),
      );
      return;
    }
    const start = new Date(`${startDate}T00:00:00Z`).getTime();
    const end = new Date(`${targetLaunchDate}T00:00:00Z`).getTime();
    if (end <= start) {
      setMessage(
        t(
          ar,
          "يجب أن يكون تاريخ الإطلاق بعد البداية.",
          "Launch must follow the start date.",
        ),
      );
      return;
    }
    const segment = (end - start) / milestoneTypes.length;
    setMilestones(
      milestoneTypes.map((item, index) => ({
        type: item.id,
        startDate: new Date(start + segment * index).toISOString().slice(0, 10),
        endDate: new Date(
          index === milestoneTypes.length - 1
            ? end
            : start + segment * (index + 1),
        )
          .toISOString()
          .slice(0, 10),
        status: "NOT_STARTED",
      })),
    );
    setMessage("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      await apiRequest({
        action: "saveProjectLaunchPlan",
        projectId: project.id,
        payload: {
          section: "TIMELINE",
          data: { startDate, targetLaunchDate, milestones },
        },
      });
      await onSaved();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t(ar, "تعذر حفظ الجدول.", "Timeline could not be saved."),
      );
    }
  }
  const startMs = plan.timeline
    ? new Date(plan.timeline.startDate).getTime()
    : 0;
  const endMs = plan.timeline
    ? new Date(plan.timeline.targetLaunchDate).getTime()
    : 0;
  const span = Math.max(endMs - startMs, 1);
  return (
    <section className="psw-page" data-testid="start-timeline">
      <PageHeading
        ar={ar}
        eyebrow={["بدء مشروع", "Start project"]}
        title={["الجدول الزمني والإطلاق", "Timeline and launch"]}
        note={[
          "ابنِ جدولًا واضحًا من تاريخ البداية إلى الإطلاق، ثم حدّث حالة كل مرحلة من التنفيذ الفعلي.",
          "Build a clear schedule from start to launch, then update each milestone from actual delivery.",
        ]}
      />
      <form className="psw-timeline-form" onSubmit={save}>
        <label>
          {t(ar, "تاريخ البداية", "Start date")}
          <input
            required
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label>
          {t(ar, "تاريخ الإطلاق المستهدف", "Target launch date")}
          <input
            required
            type="date"
            value={targetLaunchDate}
            onChange={(event) => setTargetLaunchDate(event.target.value)}
          />
        </label>
        <button
          className="psw-secondary-button"
          onClick={generate}
          type="button"
        >
          <Icon name="activity" />
          {t(ar, "توليد المراحل", "Generate milestones")}
        </button>
        <button className="psw-primary-button" type="submit">
          <Icon name="check" />
          {t(ar, "حفظ الخطة", "Save plan")}
        </button>
      </form>
      {message ? (
        <p className="psw-message" role="alert">
          {message}
        </p>
      ) : null}
      <div className="psw-timeline-layout">
        <div className="psw-panel psw-gantt">
          <header>
            <Icon name="activity" />
            <h2>{t(ar, "الجدول الزمني للمشروع", "Project schedule")}</h2>
          </header>
          {plan.timeline ? (
            <div>
              <div className="psw-gantt-axis">
                <span>
                  {formatDate(plan.timeline.startDate, ar ? "ar" : "en")}
                </span>
                <span>
                  {formatDate(plan.timeline.targetLaunchDate, ar ? "ar" : "en")}
                </span>
              </div>
              {plan.timeline.milestones.map((milestone) => {
                const itemStart = new Date(milestone.startDate).getTime();
                const itemEnd = new Date(milestone.endDate).getTime();
                const left = ((itemStart - startMs) / span) * 100;
                const width = Math.max(((itemEnd - itemStart) / span) * 100, 3);
                const meta = milestoneTypes.find(
                  (item) => item.id === milestone.type,
                );
                return (
                  <article key={milestone.type}>
                    <b>
                      {meta
                        ? t(ar, meta.label[0], meta.label[1])
                        : milestone.type}
                    </b>
                    <div>
                      <i
                        className={`tone-${milestone.status.toLowerCase()}`}
                        style={{
                          insetInlineStart: `${Math.max(left, 0)}%`,
                          width: `${Math.min(width, 100 - Math.max(left, 0))}%`,
                        }}
                      />
                    </div>
                    <small>{labelFor(milestone.status, ar)}</small>
                  </article>
                );
              })}
            </div>
          ) : (
            <p>
              {t(
                ar,
                "احفظ الجدول الزمني لعرض مخطط المراحل.",
                "Save the timeline to display the milestone chart.",
              )}
            </p>
          )}
        </div>
        <aside className="psw-timeline-aside">
          <article>
            <Icon name="rocket" />
            <span>{t(ar, "موعد الإطلاق", "Launch date")}</span>
            <strong>
              {formatDate(plan.timeline?.targetLaunchDate, ar ? "ar" : "en")}
            </strong>
          </article>
          <article>
            <Icon name="check" />
            <span>{t(ar, "المراحل المكتملة", "Completed milestones")}</span>
            <strong>
              {plan.timeline?.milestones.filter(
                (item) => item.status === "COMPLETED",
              ).length ?? 0}
              /{plan.timeline?.milestones.length ?? 0}
            </strong>
          </article>
          <article>
            <Icon name="shield" />
            <span>{t(ar, "مخاطر مفتوحة مرتفعة", "Open high risks")}</span>
            <strong>
              {
                project.risks.filter(
                  (risk) => risk.score >= 15 && risk.status === "OPEN",
                ).length
              }
            </strong>
          </article>
        </aside>
      </div>
    </section>
  );
}

function LaunchScreen({
  ar,
  onRun,
  plan,
  project,
}: {
  ar: boolean;
  onRun: (body: Record<string, unknown>, message: string) => Promise<void>;
  plan: LaunchPlan;
  project: StartProject;
}) {
  const signals = readinessSignals(project, plan);
  const complete = signals.filter((item) => item.done).length;
  const score = Math.round((complete / signals.length) * 100);
  const planning = project.phases.find((phase) => phase.type === "PLANNING");
  const evaluation = project.phases.find(
    (phase) => phase.type === "EVALUATION",
  );
  const launchReady = Boolean(plan.basics && plan.budget && plan.timeline);
  const complianceReady = project.complianceItems.every((item) =>
    ["APPROVED", "NOT_APPLICABLE"].includes(item.status),
  );
  let action: ReactNode;
  if (project.status === "IN_PROGRESS") {
    action = (
      <span className="psw-launched">
        <Icon name="check" />
        {t(
          ar,
          "تم إطلاق المشروع وبدأ التنفيذ",
          "Project launched and execution started",
        )}
      </span>
    );
  } else if (
    evaluation?.status !== "COMPLETED" ||
    project.decisions[0]?.verdict !== "APPROVE"
  ) {
    action = (
      <button className="psw-primary-button" disabled type="button">
        <Icon name="lock" />
        {t(
          ar,
          "يتطلب اعتماد تقييم المشروع",
          "Project evaluation approval required",
        )}
      </button>
    );
  } else if (!launchReady || !complianceReady) {
    action = (
      <button className="psw-primary-button" disabled type="button">
        <Icon name="lock" />
        {t(
          ar,
          "أكمل الخطة والتراخيص أولًا",
          "Complete the plan and licenses first",
        )}
      </button>
    );
  } else if (planning?.status === "PENDING") {
    action = (
      <button
        className="psw-primary-button"
        onClick={() =>
          void onRun(
            {
              action: "updatePhase",
              projectId: project.id,
              phaseType: "PLANNING",
              status: "ACTIVE",
              notes: "Launch planning started",
            },
            t(ar, "تم تفعيل مرحلة التخطيط.", "Planning activated."),
          )
        }
        type="button"
      >
        <Icon name="activity" />
        {t(ar, "تفعيل مرحلة التخطيط", "Activate planning")}
      </button>
    );
  } else if (planning?.status === "ACTIVE") {
    action = (
      <button
        className="psw-primary-button"
        onClick={() =>
          void onRun(
            {
              action: "updatePhase",
              projectId: project.id,
              phaseType: "PLANNING",
              status: "COMPLETED",
              notes: "Launch plan reviewed and completed",
            },
            t(ar, "اكتملت مرحلة التخطيط.", "Planning completed."),
          )
        }
        type="button"
      >
        <Icon name="check" />
        {t(ar, "اعتماد اكتمال التخطيط", "Complete planning")}
      </button>
    );
  } else {
    action = (
      <button
        className="psw-primary-button"
        onClick={() =>
          void onRun(
            { action: "start", projectId: project.id },
            t(ar, "تم بدء تنفيذ المشروع.", "Project execution started."),
          )
        }
        type="button"
      >
        <Icon name="rocket" />
        {t(ar, "إطلاق المشروع", "Launch project")}
      </button>
    );
  }
  return (
    <section className="psw-page psw-launch-page" data-testid="start-launch">
      <PageHeading
        ar={ar}
        eyebrow={["القرار النهائي", "Final decision"]}
        title={["جاهزية الإطلاق", "Launch readiness"]}
        note={[
          "تعكس النسبة اكتمال متطلبات المنصة فقط؛ لا تعني ضمان نجاح المشروع.",
          "The score reflects platform requirement completion only; it does not guarantee project success.",
        ]}
        actions={
          <Link
            className="psw-secondary-button"
            href={`/projects/start/report?project=${project.id}`}
          >
            <Icon name="eye" />
            {t(ar, "عرض التقرير", "View report")}
          </Link>
        }
      />
      <div className="psw-launch-hero">
        <span
          className="psw-score-ring is-large"
          style={{ "--psw-score": `${score * 3.6}deg` } as CSSProperties}
        >
          <b>{score}%</b>
          <small>{t(ar, "جاهزية", "Ready")}</small>
        </span>
        <div>
          <h2>{project.name}</h2>
          <p>
            {t(
              ar,
              `${complete} من ${signals.length} متطلبات مكتملة.`,
              `${complete} of ${signals.length} requirements are complete.`,
            )}
          </p>
          {action}
        </div>
      </div>
      <div className="psw-launch-grid">
        <article className="psw-panel">
          <header>
            <Icon name="check" />
            <h2>{t(ar, "قائمة الجاهزية", "Readiness checklist")}</h2>
          </header>
          <ul className="psw-signal-list">
            {signals.map((signal) => (
              <li className={signal.done ? "is-done" : ""} key={signal.id}>
                <Icon name={signal.done ? "check" : "activity"} />
                <span>{t(ar, signal.label[0], signal.label[1])}</span>
                <b>
                  {signal.done
                    ? t(ar, "مكتمل", "Complete")
                    : t(ar, "متبقٍ", "Pending")}
                </b>
              </li>
            ))}
          </ul>
        </article>
        <article className="psw-panel">
          <header>
            <Icon name="shield" />
            <h2>{t(ar, "المخاطر والتنبيهات", "Risks and alerts")}</h2>
          </header>
          {project.risks.length ? (
            <ul className="psw-risk-list">
              {project.risks.map((risk) => (
                <li key={risk.id}>
                  <span
                    className={
                      risk.score >= 15
                        ? "is-high"
                        : risk.score >= 8
                          ? "is-medium"
                          : "is-low"
                    }
                  >
                    {risk.score}/25
                  </span>
                  <div>
                    <b>{risk.title}</b>
                    <small>{labelFor(risk.status, ar)}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {t(
                ar,
                "لا توجد مخاطر مسجلة. غياب السجل لا يعني انعدام المخاطر.",
                "No risks are recorded. An empty register does not mean risk-free.",
              )}
            </p>
          )}
        </article>
      </div>
    </section>
  );
}

function ReportScreen({
  ar,
  locale,
  plan,
  project,
}: {
  ar: boolean;
  locale: Locale;
  plan: LaunchPlan;
  project: StartProject;
}) {
  const signals = readinessSignals(project, plan);
  const score = Math.round(
    (signals.filter((item) => item.done).length / signals.length) * 100,
  );
  return (
    <section className="psw-page" data-testid="start-report">
      <PageHeading
        ar={ar}
        eyebrow={["تقرير بدء المشروع", "Project start report"]}
        title={["خطة الإطلاق التنفيذية", "Executive launch plan"]}
        note={[
          "ملخص حي من بيانات المشروع والتراخيص والميزانية والموارد والجدول.",
          "A live summary of project data, licenses, budget, resources, and timeline.",
        ]}
        actions={
          <a
            className="psw-primary-button"
            href={`/api/projects/${project.id}/report`}
          >
            <Icon name="arrow" />
            {t(ar, "تنزيل PDF", "Download PDF")}
          </a>
        }
      />
      <article className="psw-report-sheet">
        <header>
          <span>
            Jenan <b>PRO</b>
          </span>
          <small>{t(ar, "خطة بدء مشروع", "Project launch plan")}</small>
        </header>
        <h1>{project.name}</h1>
        <p>{project.description}</p>
        <div className="psw-report-score">
          <strong>{score}%</strong>
          <span>
            <b>
              {t(ar, "اكتمال متطلبات الإطلاق", "Launch requirement completion")}
            </b>
            <small>
              {t(
                ar,
                "ليست توقعًا لنسبة نجاح المشروع",
                "Not a prediction of project success",
              )}
            </small>
          </span>
        </div>
        <section>
          <h2>{t(ar, "البيانات الأساسية", "Core data")}</h2>
          <div className="psw-report-cards">
            <span>
              <small>{t(ar, "المدينة", "City")}</small>
              <b>{plan.basics?.city ?? "—"}</b>
            </span>
            <span>
              <small>{t(ar, "رأس المال", "Initial capital")}</small>
              <b>
                {formatNumber(plan.basics?.initialCapital, locale)}{" "}
                {project.currency}
              </b>
            </span>
            <span>
              <small>{t(ar, "مدة التنفيذ", "Duration")}</small>
              <b>
                {plan.basics
                  ? `${plan.basics.durationMonths} ${t(ar, "شهرًا", "months")}`
                  : "—"}
              </b>
            </span>
            <span>
              <small>{t(ar, "حجم الفريق", "Team size")}</small>
              <b>{plan.basics?.teamSize ?? "—"}</b>
            </span>
          </div>
        </section>
        <section>
          <h2>{t(ar, "الميزانية والموارد", "Budget and resources")}</h2>
          <p>
            {plan.budget
              ? t(
                  ar,
                  `إجمالي الميزانية المحفوظة ${formatNumber(plan.budget.totalBudget, locale)} ${project.currency}، والمبلغ الموزع ${formatNumber(
                    plan.budget.allocations.reduce(
                      (sum, item) => sum + item.amount,
                      0,
                    ),
                    locale,
                  )} ${project.currency}.`,
                  `Saved budget is ${formatNumber(plan.budget.totalBudget, locale)} ${project.currency}; allocated amount is ${formatNumber(
                    plan.budget.allocations.reduce(
                      (sum, item) => sum + item.amount,
                      0,
                    ),
                    locale,
                  )} ${project.currency}.`,
                )
              : t(ar, "لم تُحفظ الميزانية.", "Budget is not saved.")}
          </p>
        </section>
        <section>
          <h2>{t(ar, "الجدول الزمني", "Timeline")}</h2>
          <p>
            {plan.timeline
              ? t(
                  ar,
                  `من ${formatDate(plan.timeline.startDate, locale)} إلى ${formatDate(plan.timeline.targetLaunchDate, locale)} عبر ${plan.timeline.milestones.length} مراحل.`,
                  `From ${formatDate(plan.timeline.startDate, locale)} to ${formatDate(plan.timeline.targetLaunchDate, locale)} across ${plan.timeline.milestones.length} milestones.`,
                )
              : t(ar, "لم يُحفظ الجدول الزمني.", "Timeline is not saved.")}
          </p>
        </section>
        <section>
          <h2>{t(ar, "حالة المتطلبات", "Requirement status")}</h2>
          <ul>
            {signals.map((signal) => (
              <li key={signal.id}>
                <Icon name={signal.done ? "check" : "activity"} />
                {t(ar, signal.label[0], signal.label[1])} —{" "}
                {signal.done
                  ? t(ar, "مكتمل", "Complete")
                  : t(ar, "متبقٍ", "Pending")}
              </li>
            ))}
          </ul>
        </section>
        <footer>
          <span>
            Jenan <b>PRO</b>
          </span>
          <small>{formatDate(project.launchPlanUpdatedAt, locale)}</small>
        </footer>
      </article>
    </section>
  );
}

export function ProjectStartWorkspace({
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
  const creatingNew = route.endsWith("/new") && searchParams.get("new") === "1";
  const [projects, setProjects] = useState<StartProject[]>([]);
  const [selectedId, setSelectedId] = useState(requestedProjectId);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (preferredId = "") => {
      setLoading(true);
      try {
        const loaded = await listProjects();
        setProjects(loaded);
        setSelectedId((current) => {
          const candidate = preferredId || requestedProjectId || current;
          return loaded.some((project) => project.id === candidate)
            ? candidate
            : (loaded[0]?.id ?? "");
        });
        setMessage("");
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
  const plan = useMemo(
    () => readLaunchPlan(selected?.launchPlan),
    [selected?.launchPlan],
  );

  async function run(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setMessage("");
    try {
      await apiRequest(body);
      await load(selectedId);
      setMessage(successMessage);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t(
              ar,
              "تعذر تنفيذ العملية.",
              "The operation could not be completed.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function basicsSaved(projectId: string) {
    await load(projectId);
    router.push(`/projects/start/licenses?project=${projectId}`);
  }

  function changeProject(projectId: string) {
    setSelectedId(projectId);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    params.set("project", projectId);
    router.push(`${route}?${params.toString()}`);
  }

  let screen: ReactNode;
  if (route.endsWith("/new")) {
    const editedProject = creatingNew ? undefined : selected;
    screen = (
      <BasicsScreen
        key={editedProject?.id ?? "new"}
        ar={ar}
        busy={busy}
        locale={locale}
        onSaved={basicsSaved}
        project={editedProject}
      />
    );
  } else if (!selected) {
    screen = (
      <div className="psw-empty">
        <Icon name="rocket" />
        <h1>{t(ar, "ابدأ بأول مشروع", "Start your first project")}</h1>
        <p>
          {t(
            ar,
            "أنشئ سجل المشروع ثم أكمل التراخيص والميزانية والموارد والجدول.",
            "Create the project record, then complete licenses, budget, resources, and timeline.",
          )}
        </p>
        <Link className="psw-primary-button" href="/projects/start/new?new=1">
          {t(ar, "إدخال بيانات المشروع", "Enter project data")}
        </Link>
      </div>
    );
  } else if (route.endsWith("/licenses")) {
    screen = <LicensesScreen ar={ar} onRun={run} project={selected} />;
  } else if (route.endsWith("/setup")) {
    screen = (
      <BudgetScreen
        ar={ar}
        locale={locale}
        onSaved={() => load(selected.id)}
        plan={plan}
        project={selected}
      />
    );
  } else if (route.endsWith("/team") || route.endsWith("/vendors")) {
    screen = (
      <TeamVendorsScreen
        ar={ar}
        mode={route.endsWith("/vendors") ? "vendors" : "team"}
        onRun={run}
        onSaved={() => load(selected.id)}
        plan={plan}
        project={selected}
      />
    );
  } else if (route.endsWith("/roadmap")) {
    screen = (
      <TimelineScreen
        ar={ar}
        onSaved={() => load(selected.id)}
        plan={plan}
        project={selected}
      />
    );
  } else if (route.endsWith("/launch")) {
    screen = (
      <LaunchScreen ar={ar} onRun={run} plan={plan} project={selected} />
    );
  } else if (route.endsWith("/report")) {
    screen = (
      <ReportScreen ar={ar} locale={locale} plan={plan} project={selected} />
    );
  } else {
    screen = (
      <DashboardScreen ar={ar} locale={locale} plan={plan} project={selected} />
    );
  }

  return (
    <main
      className={`project-start-workspace ${route === "/projects/start" ? "project-start-dashboard" : ""}`}
      data-project-start-route={route}
      data-project-start-source="ACCOUNT_PROJECT_RECORDS"
      dir={ar ? "rtl" : "ltr"}
    >
      <header className="psw-shell-header">
        <Link className="psw-shell-brand" href="/projects">
          <strong>
            Jenan <b>PRO</b>
          </strong>
          <small>
            {t(
              ar,
              "من الفكرة إلى المشروع الناجح",
              "From idea to a successful project",
            )}
          </small>
        </Link>
        <StartNavigation activeRoute={route} ar={ar} projectId={selected?.id} />
        <div className="psw-shell-actions">
          {!loading && projects.length ? (
            <ProjectSelector
              ar={ar}
              onChange={changeProject}
              projects={projects}
              selectedId={selectedId}
            />
          ) : (
            <Link
              className="psw-shell-new"
              href="/projects/start/new?new=1"
              title={t(ar, "مشروع جديد", "New project")}
            >
              <Icon name="plus" />
            </Link>
          )}
          <button
            aria-label={t(ar, "لا توجد تنبيهات جديدة", "No new notifications")}
            disabled
            type="button"
          >
            <Icon name="bell" />
          </button>
          <span className="psw-shell-avatar" title={userLabel}>
            {userLabel.slice(0, 2).toUpperCase()}
          </span>
        </div>
      </header>
      {message ? (
        <p className="psw-global-message" role="status">
          {message}
        </p>
      ) : null}
      {loading ? (
        <div className="psw-loading">
          <Icon name="activity" />
          {t(ar, "جارٍ تحميل خطة المشروع...", "Loading project plan...")}
        </div>
      ) : (
        screen
      )}
    </main>
  );
}
