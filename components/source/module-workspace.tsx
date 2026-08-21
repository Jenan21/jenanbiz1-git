import Link from "next/link";
import { PlatformShell, WorldNetwork } from "@/components/source/source-ui";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Pair = readonly [string, string];
type Capability = readonly [IconName, Pair, Pair];

interface WorkspaceBlueprint {
  title: Pair;
  eyebrow: Pair;
  description: Pair;
  capabilities: ReadonlyArray<Capability>;
  stages: ReadonlyArray<Pair>;
}

const workspaces: Record<string, WorkspaceBlueprint> = {
  "/dashboard": {
    title: ["مركز أعمالك العالمي", "Your global business command"],
    eyebrow: ["لوحة القيادة الموحدة", "Unified command dashboard"],
    description: [
      "بوابة واحدة تربط مساحات Jenan BIZ وتعرض الحالة الحقيقية لكل قطاع عند تفعيل مصادره.",
      "One gateway connecting every Jenan BIZ workspace and its truthful state when approved sources go live.",
    ],
    capabilities: [
      [
        "briefcase",
        ["قيادة المشاريع", "Project command"],
        [
          "محفظة موحدة للتخطيط والمتابعة والقرارات.",
          "One portfolio for planning, delivery, and decisions.",
        ],
      ],
      [
        "graduation",
        ["أكاديمية جنان", "Jenan Academy"],
        [
          "مسارات تعلم وشهادات وخبرات منظمة.",
          "Structured learning, credentials, and expertise.",
        ],
      ],
      [
        "people",
        ["التوظيف والكفاءات", "Recruitment & talent"],
        [
          "اكتشاف المهارات وربطها بالفرص المناسبة.",
          "Discover skills and align them with opportunities.",
        ],
      ],
      [
        "cart",
        ["سوق جنان", "Jenan Market"],
        [
          "مساحة موحدة للعروض والطلبات والفرص.",
          "A unified space for offers, requests, and opportunities.",
        ],
      ],
    ],
    stages: [
      ["اكتشاف الاحتياج", "Discover"],
      ["إعداد المساحة", "Configure"],
      ["مراجعة بشرية", "Human review"],
      ["تفعيل لاحق", "Future activation"],
    ],
  },
  "/projects": {
    title: ["مركز المشاريع", "Projects center"],
    eyebrow: ["من الفكرة إلى التسليم", "From idea to delivery"],
    description: [
      "واجهة متكاملة لتنظيم المحافظ والفرق والمراحل والقرارات دون تشغيل محرك المشاريع بعد.",
      "A complete interface for portfolios, teams, stages, and decisions without activating the project engine.",
    ],
    capabilities: [
      [
        "grid",
        ["محفظة المشاريع", "Project portfolio"],
        [
          "تصنيف المبادرات حسب القطاع والأولوية والحالة.",
          "Organize initiatives by sector, priority, and state.",
        ],
      ],
      [
        "activity",
        ["غرفة التنفيذ", "Delivery room"],
        [
          "مراحل ومخاطر واعتماديات ضمن رؤية واحدة.",
          "Stages, risks, and dependencies in one view.",
        ],
      ],
      [
        "people",
        ["الفرق والأدوار", "Teams & roles"],
        [
          "مسؤوليات واضحة ومسارات تصعيد قابلة للمراجعة.",
          "Clear ownership and reviewable escalation paths.",
        ],
      ],
      [
        "shield",
        ["القرارات والحوكمة", "Decisions & governance"],
        [
          "سجل تصميمي للموافقات والتغييرات والتوصيات.",
          "A design shell for approvals, changes, and recommendations.",
        ],
      ],
    ],
    stages: [
      ["طلب مشروع", "Project request"],
      ["تقييم وجدولة", "Assess & schedule"],
      ["تنفيذ ومراجعة", "Deliver & review"],
      ["إغلاق وتعلم", "Close & learn"],
    ],
  },
  "/academy": {
    title: ["أكاديمية جنان", "Jenan Academy"],
    eyebrow: ["معرفة تنمو مع الأعمال", "Knowledge that grows with business"],
    description: [
      "منظومة تعلم عالمية للمسارات والشهادات والمدربين والمختبرات، مع إبقاء التسجيل والمحتوى غير مفعّلين.",
      "A global learning ecosystem for paths, credentials, instructors, and labs, while enrollment and content remain inactive.",
    ],
    capabilities: [
      [
        "graduation",
        ["مسارات التعلم", "Learning paths"],
        [
          "رحلات تعليمية حسب الدور والقطاع ومستوى الخبرة.",
          "Learning journeys by role, sector, and experience.",
        ],
      ],
      [
        "check",
        ["الشهادات والاعتماد", "Credentials"],
        [
          "هيكل موحد للتحقق والاعتماد عند توفر الجهات.",
          "A unified verification model when issuers are connected.",
        ],
      ],
      [
        "people",
        ["شبكة الخبراء", "Expert network"],
        [
          "مساحة للمدربين والموجهين والمراجعين.",
          "A home for instructors, mentors, and reviewers.",
        ],
      ],
      [
        "sparkles",
        ["مختبرات التطبيق", "Practice labs"],
        [
          "سيناريوهات عملية ومشروعات تعلم مستقبلية.",
          "Future hands-on scenarios and learning projects.",
        ],
      ],
    ],
    stages: [
      ["تحديد المهارة", "Define skill"],
      ["بناء المسار", "Build path"],
      ["مراجعة واعتماد", "Review & approve"],
      ["تعلم وقياس", "Learn & measure"],
    ],
  },
  "/talent": {
    title: ["مركز التوظيف والكفاءات", "Recruitment & talent center"],
    eyebrow: [
      "المهارة المناسبة للمكان المناسب",
      "Right skill, right opportunity",
    ],
    description: [
      "واجهة احترافية لاكتشاف المواهب والوظائف والمطابقة والتأهيل، دون نشر وظائف أو ملفات شخصية حقيقية.",
      "A professional shell for talent, roles, matching, and onboarding without publishing real jobs or profiles.",
    ],
    capabilities: [
      [
        "people",
        ["مجتمع الكفاءات", "Talent community"],
        [
          "تصنيفات للخبرات والتخصصات ومستويات الجاهزية.",
          "Expertise, specialization, and readiness categories.",
        ],
      ],
      [
        "briefcase",
        ["مكتب الفرص", "Opportunity desk"],
        [
          "قوالب للوظائف والمهمات والتعاقدات المستقبلية.",
          "Templates for future roles, missions, and contracts.",
        ],
      ],
      [
        "sparkles",
        ["المطابقة الذكية", "Intelligent matching"],
        [
          "تصور للمطابقة مع تفسير ومراجعة بشرية.",
          "Explainable matching with mandatory human review.",
        ],
      ],
      [
        "shield",
        ["التأهيل والامتثال", "Onboarding & compliance"],
        [
          "رحلة موثقة من القبول حتى بدء العمل.",
          "A documented journey from acceptance to start.",
        ],
      ],
    ],
    stages: [
      ["تعريف الاحتياج", "Define need"],
      ["بحث ومطابقة", "Search & match"],
      ["مقابلة ومراجعة", "Interview & review"],
      ["تأهيل لاحق", "Future onboarding"],
    ],
  },
  "/software": {
    title: ["حلول Jenan البرمجية", "Jenan software solutions"],
    eyebrow: ["أدوات تنمو مع منظومتك", "Tools that grow with your ecosystem"],
    description: [
      "كتالوج منظم للحلول والروبوتات والأتمتة والتكاملات، دون شراء أو تشغيل أو اتصال خارجي.",
      "An organized catalog for solutions, robotics, automation, and integrations without purchasing, execution, or external connectivity.",
    ],
    capabilities: [
      [
        "grid",
        ["كتالوج الحلول", "Solutions catalog"],
        [
          "حزم حسب القطاع والحجم ومرحلة العمل.",
          "Packages by sector, scale, and business stage.",
        ],
      ],
      [
        "settings",
        ["الروبوتات الذكية", "Intelligent robotics"],
        [
          "تصورات للروبوتات والمهام والمتطلبات.",
          "Concepts for robots, missions, and requirements.",
        ],
      ],
      [
        "activity",
        ["استوديو الأتمتة", "Automation studio"],
        [
          "مسارات مرئية للعمليات والموافقات البشرية.",
          "Visual workflows with human approval gates.",
        ],
      ],
      [
        "globe",
        ["التكاملات", "Integrations"],
        [
          "سجل مستقبلي للموصلات ومصادر البيانات.",
          "A future registry for connectors and data sources.",
        ],
      ],
    ],
    stages: [
      ["اختيار الحل", "Select solution"],
      ["تقييم الملاءمة", "Assess fit"],
      ["مراجعة الأمان", "Security review"],
      ["تفعيل منفصل", "Separate activation"],
    ],
  },
  "/programs": {
    title: ["برامج Jenan", "Jenan Programs"],
    eyebrow: ["مبادرات تصنع أثرًا", "Programs that create impact"],
    description: [
      "مركز للبرامج والمسرعات والشراكات والإرشاد، مصمم كواجهة قابلة للتوسع دون تسجيل أو تشغيل.",
      "A center for programs, accelerators, partnerships, and mentorship, designed as an extensible shell without enrollment or operations.",
    ],
    capabilities: [
      [
        "rocket",
        ["المسرعات", "Accelerators"],
        [
          "رحلات نمو للمشروعات حسب المرحلة والقطاع.",
          "Growth journeys by venture stage and sector.",
        ],
      ],
      [
        "people",
        ["الشراكات", "Partnerships"],
        [
          "مساحة للشركاء والأدوار ومخرجات التعاون.",
          "A space for partners, roles, and collaboration outcomes.",
        ],
      ],
      [
        "wallet",
        ["الدعم والحوافز", "Support & incentives"],
        [
          "تصنيف الفرص دون مبالغ أو وعود غير موثقة.",
          "Opportunity categories without unsupported promises.",
        ],
      ],
      [
        "graduation",
        ["الإرشاد والفعاليات", "Mentorship & events"],
        [
          "تقويم تصميمي للجلسات والمختبرات واللقاءات.",
          "A design calendar for sessions, labs, and events.",
        ],
      ],
    ],
    stages: [
      ["اقتراح البرنامج", "Propose"],
      ["تصميم المسار", "Design"],
      ["اعتماد الشركاء", "Partner review"],
      ["إطلاق لاحق", "Future launch"],
    ],
  },
  "/marketing": {
    title: ["الإعلان والتسويق", "Advertising & Marketing"],
    eyebrow: ["علامة متماسكة ونمو مسؤول", "Coherent brand, responsible growth"],
    description: [
      "مساحة لتخطيط العلامة والحملات والمحتوى والجمهور مع مراجعة بشرية، دون نشر أو ربط حسابات.",
      "A workspace for brand, campaigns, content, and audience planning with human review, without publishing or connecting accounts.",
    ],
    capabilities: [
      [
        "sparkles",
        ["استوديو العلامة", "Brand studio"],
        [
          "رسائل وهوية وأصول ضمن قواعد واضحة.",
          "Messaging, identity, and assets within clear rules.",
        ],
      ],
      [
        "trend",
        ["مخطط الحملات", "Campaign planner"],
        [
          "أهداف وقنوات وميزانيات كقوالب غير تشغيلية.",
          "Goals, channels, and budgets as inactive templates.",
        ],
      ],
      [
        "grid",
        ["مركز المحتوى", "Content center"],
        [
          "تقويم ومراحل تحرير واعتماد قبل النشر.",
          "Calendar, editorial stages, and approval before publishing.",
        ],
      ],
      [
        "people",
        ["ذكاء الجمهور", "Audience intelligence"],
        [
          "شرائح بحثية دون تتبع خفي أو بيانات شخصية.",
          "Research segments without covert tracking or personal data.",
        ],
      ],
    ],
    stages: [
      ["بحث الجمهور", "Audience research"],
      ["صياغة الحملة", "Campaign design"],
      ["مراجعة واعتماد", "Review & approve"],
      ["نشر خارجي منفصل", "Separate publishing"],
    ],
  },
  "/market": {
    title: ["سوق جنان", "Jenan Market"],
    eyebrow: [
      "فرص عالمية ضمن مساحة موثوقة",
      "Global opportunities in a trusted space",
    ],
    description: [
      "واجهة سوق للعروض والطلبات والشركاء والاتفاقيات؛ القوائم والأسعار والتعاملات غير مفعّلة.",
      "A market interface for offers, requests, partners, and agreements; listings, prices, and transactions remain inactive.",
    ],
    capabilities: [
      [
        "building",
        ["بوابة البائع", "Seller hub"],
        [
          "قوالب للأعمال والمنتجات والتحقق المؤسسي.",
          "Templates for businesses, products, and organization checks.",
        ],
      ],
      [
        "search",
        ["طلبات المشترين", "Buyer requests"],
        [
          "احتياجات منظمة دون طلبات أو التزامات حقيقية.",
          "Structured needs without real requests or commitments.",
        ],
      ],
      [
        "globe",
        ["فرص الأعمال", "Business opportunities"],
        [
          "تصنيف جغرافي وقطاعي للفرص المستقبلية.",
          "Geographic and sector classification for future opportunities.",
        ],
      ],
      [
        "shield",
        ["الثقة والاتفاقيات", "Trust & agreements"],
        [
          "مسارات تحقق وموافقة قبل أي تعامل.",
          "Verification and approval paths before any transaction.",
        ],
      ],
    ],
    stages: [
      ["إنشاء المساحة", "Create space"],
      ["توثيق العرض", "Verify offer"],
      ["مطابقة ومراجعة", "Match & review"],
      ["تعاقد خارجي", "External contract"],
    ],
  },
};

export function ModuleWorkspace({
  locale,
  route,
  userLabel,
}: {
  locale: Locale;
  route: string;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const index = ar ? 0 : 1;
  const cfg = workspaces[route] ?? workspaces["/dashboard"];
  const inactive = ar
    ? "واجهة تصميمية — غير مفعّلة"
    : "Design shell — inactive";

  return (
    <PlatformShell locale={locale} activeRoute={route} userLabel={userLabel}>
      <section className="module-hero glass">
        <div className="module-hero__copy">
          <span className="eyebrow">{cfg.eyebrow[index]}</span>
          <h1>{cfg.title[index]}</h1>
          <p>{cfg.description[index]}</p>
          <div className="module-hero__status">
            <span>
              <i />
              {inactive}
            </span>
            <span>
              {ar ? "قابل للربط لاحقًا" : "Ready for future integration"}
            </span>
          </div>
        </div>
        <div className="module-hero__network" aria-hidden="true">
          <WorldNetwork />
          <span className="module-core">J</span>
        </div>
      </section>

      <section
        className="module-kpis"
        aria-label={ar ? "حالة الوحدة" : "Module status"}
      >
        {(ar
          ? [
              "المصادر المتصلة",
              "العمليات النشطة",
              "الموافقات",
              "آخر تحديث موثوق",
            ]
          : [
              "Connected sources",
              "Active operations",
              "Approvals",
              "Last trusted update",
            ]
        ).map((label) => (
          <article className="card module-kpi" key={label}>
            <span>{label}</span>
            <strong>—</strong>
            <small>
              {ar ? "بانتظار مصدر حقيقي" : "Awaiting a real source"}
            </small>
          </article>
        ))}
      </section>

      <section className="module-command-grid">
        <div className="module-capabilities">
          {cfg.capabilities.map(([icon, title, description], itemIndex) => (
            <article className="card module-capability" key={title[1]}>
              <span className="module-capability__index">0{itemIndex + 1}</span>
              <span className="module-capability__icon">
                <Icon name={icon} />
              </span>
              <div>
                <h2>{title[index]}</h2>
                <p>{description[index]}</p>
              </div>
              {route === "/software" && itemIndex === 1 ? (
                <Link
                  className="module-capability__action"
                  href="/software/robotics"
                >
                  {ar ? "استعراض الواجهة" : "View interface"}{" "}
                  <Icon name="arrow" />
                </Link>
              ) : (
                <span className="module-capability__state">
                  {ar ? "تصميم فقط" : "Design only"}
                </span>
              )}
            </article>
          ))}
        </div>
        <aside className="card module-readiness">
          <header>
            <span className="eyebrow">READINESS FRAMEWORK</span>
            <h2>{ar ? "جاهزية الإطلاق" : "Launch readiness"}</h2>
          </header>
          {(ar
            ? [
                "تصميم التجربة",
                "العقود والبيانات",
                "الأمان والصلاحيات",
                "التشغيل والمراقبة",
              ]
            : [
                "Experience design",
                "Contracts & data",
                "Security & access",
                "Operations & monitoring",
              ]
          ).map((label, itemIndex) => (
            <div className="module-readiness__row" key={label}>
              <span>{label}</span>
              <i>
                <b style={{ width: itemIndex === 0 ? "78%" : "18%" }} />
              </i>
              <small>
                {itemIndex === 0
                  ? ar
                    ? "قيد المراجعة"
                    : "In review"
                  : ar
                    ? "غير متصل"
                    : "Not connected"}
              </small>
            </div>
          ))}
          <div className="notice">
            <Icon name="shield" />
            {ar
              ? "لا يمكن تنفيذ أي عملية قبل الاعتماد والربط."
              : "No operation can run before approval and integration."}
          </div>
        </aside>
      </section>

      <section className="card module-roadmap">
        <header>
          <div>
            <span className="eyebrow">MODULE FLOW</span>
            <h2>{ar ? "مسار العمل المقترح" : "Proposed workflow"}</h2>
          </div>
          <span className="badge">{inactive}</span>
        </header>
        <div className="module-roadmap__steps">
          {cfg.stages.map((stage, itemIndex) => (
            <div key={stage[1]}>
              <span>{String(itemIndex + 1).padStart(2, "0")}</span>
              <strong>{stage[index]}</strong>
              <small>
                {ar ? "مرحلة قابلة للتخصيص لاحقًا" : "Customizable later"}
              </small>
            </div>
          ))}
        </div>
      </section>

      <section className="module-bottom-grid">
        <article className="card module-activity">
          <header>
            <h2>{ar ? "سجل النشاط" : "Activity stream"}</h2>
            <span>{ar ? "مراقبة مستقبلية" : "Future monitoring"}</span>
          </header>
          <div className="module-empty">
            <Icon name="activity" />
            <strong>
              {ar ? "لا يوجد نشاط تشغيلي" : "No operational activity"}
            </strong>
            <p>
              {ar
                ? "سيظهر النشاط فقط بعد ربط الخدمات المعتمدة."
                : "Activity appears only after approved services are connected."}
            </p>
          </div>
        </article>
        <article className="card module-governance">
          <header>
            <h2>{ar ? "بوابات الحوكمة" : "Governance gates"}</h2>
          </header>
          {(
            [
              [ar ? "مالك واضح" : "Named owner", "user"],
              [ar ? "موافقة بشرية" : "Human approval", "check"],
              [ar ? "سجل تدقيق" : "Audit trail", "shield"],
              [ar ? "إيقاف آمن" : "Safe stop", "x"],
            ] as Array<[string, IconName]>
          ).map(([label, icon]) => (
            <div key={label}>
              <Icon name={icon} />
              <span>{label}</span>
              <b>—</b>
            </div>
          ))}
        </article>
      </section>
    </PlatformShell>
  );
}
