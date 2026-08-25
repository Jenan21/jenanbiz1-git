import Link from "next/link";
import type { CSSProperties } from "react";

import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Copy = readonly [ar: string, en: string];
type Division = Readonly<{
  icon: IconName;
  title: Copy;
  description: Copy;
  href?: string;
}>;

const divisionBlueprints: Readonly<Record<string, readonly Division[]>> = {
  "/dashboard": [
    {
      icon: "briefcase",
      title: ["المشاريع", "Projects"],
      description: [
        "مساحة موحدة للمبادرات والتنفيذ والقرارات.",
        "A unified space for initiatives, delivery, and decisions.",
      ],
    },
    {
      icon: "graduation",
      title: ["أكاديمية جنان", "Jenan Academy"],
      description: [
        "معرفة تطبيقية ومسارات تعلم مرتبطة بالعمل.",
        "Applied knowledge and learning paths connected to work.",
      ],
    },
    {
      icon: "people",
      title: ["المواهب", "Talent"],
      description: [
        "اكتشاف الكفاءات وتكوين الفرق بوضوح.",
        "Discover capabilities and shape teams with clarity.",
      ],
    },
    {
      icon: "cart",
      title: ["سوق جنان", "Jenan Market"],
      description: [
        "فرص وعروض وطلبات في تجربة موثوقة.",
        "Opportunities, offers, and requests in a trusted experience.",
      ],
    },
    {
      icon: "settings",
      title: ["البرمجيات والروبوتات", "Software & Robotics"],
      description: [
        "حلول ذكية وأتمتة قابلة للتوسع.",
        "Intelligent solutions and scalable automation.",
      ],
      href: "/software/robotics",
    },
    {
      icon: "rocket",
      title: ["البرامج", "Programs"],
      description: [
        "مسرعات وشراكات ومسارات دعم مترابطة.",
        "Connected accelerators, partnerships, and support tracks.",
      ],
    },
    {
      icon: "sparkles",
      title: ["الإعلان والتسويق", "Marketing"],
      description: [
        "هوية ومحتوى وحملات ضمن حوكمة واضحة.",
        "Brand, content, and campaigns under clear governance.",
      ],
    },
    {
      icon: "shield",
      title: ["الحوكمة", "Governance"],
      description: [
        "ضوابط وصلاحيات وحالة بيانات صادقة.",
        "Controls, permissions, and truthful data states.",
      ],
    },
  ],
  "/projects": [
    {
      icon: "briefcase",
      title: ["محفظة المبادرات", "Initiative portfolio"],
      description: [
        "رؤية مترابطة للمشاريع حسب الحالة والأولوية.",
        "A connected view of projects by state and priority.",
      ],
    },
    {
      icon: "sparkles",
      title: ["طلبات المشاريع", "Project requests"],
      description: [
        "تحويل الأفكار إلى طلبات منظمة قابلة للمراجعة.",
        "Turn ideas into structured, reviewable requests.",
      ],
    },
    {
      icon: "activity",
      title: ["غرفة التنفيذ", "Delivery room"],
      description: [
        "متابعة المراحل والاعتماديات والمخاطر.",
        "Track stages, dependencies, and risks.",
      ],
    },
    {
      icon: "people",
      title: ["الفرق والموارد", "Teams & resources"],
      description: [
        "توزيع المسؤوليات والقدرات دون ازدواجية.",
        "Allocate ownership and capacity without duplication.",
      ],
    },
    {
      icon: "wallet",
      title: ["التكلفة والمشتريات", "Cost & procurement"],
      description: [
        "قرارات مالية مرتبطة بسياق المشروع.",
        "Financial decisions connected to project context.",
      ],
    },
    {
      icon: "shield",
      title: ["مكتب القرار", "Decision desk"],
      description: [
        "اعتمادات موثقة ومسار تصعيد واضح.",
        "Recorded approvals and a clear escalation path.",
      ],
    },
  ],
  "/academy": [
    {
      icon: "graduation",
      title: ["مكتبة المواد", "Materials library"],
      description: [
        "مواد منظمة حسب المجال والمستوى والهدف.",
        "Materials organized by domain, level, and outcome.",
      ],
    },
    {
      icon: "trend",
      title: ["مسارات التعلم", "Learning paths"],
      description: [
        "رحلات تعلم متدرجة مرتبطة بالمهارات.",
        "Progressive learning journeys tied to skills.",
      ],
    },
    {
      icon: "briefcase",
      title: ["مشاريع تطبيقية", "Applied projects"],
      description: [
        "تعلم ينتقل مباشرة من المعرفة إلى الإنجاز.",
        "Learning that moves directly from knowledge to delivery.",
      ],
    },
    {
      icon: "sparkles",
      title: ["المختبرات الذكية", "Intelligent labs"],
      description: [
        "تجارب مستقبلية آمنة وقابلة للقياس.",
        "Safe, measurable, future-facing experiments.",
      ],
    },
    {
      icon: "people",
      title: ["المدربون والمرشدون", "Instructors & mentors"],
      description: [
        "خبرات بشرية تربط النظرية بالممارسة.",
        "Human expertise connecting theory to practice.",
      ],
    },
    {
      icon: "shield",
      title: ["الشهادات والتحقق", "Credentials & verification"],
      description: [
        "إنجازات موثوقة قابلة للمشاركة والتحقق.",
        "Trusted achievements that can be shared and verified.",
      ],
    },
  ],
  "/talent": [
    {
      icon: "people",
      title: ["مجتمع الكفاءات", "Talent community"],
      description: [
        "ملفات مهنية غنية بالمهارات والخبرة.",
        "Professional profiles rich in skills and experience.",
      ],
    },
    {
      icon: "briefcase",
      title: ["مكتب الفرص", "Opportunity desk"],
      description: [
        "فرص منظمة وواضحة المتطلبات.",
        "Structured opportunities with clear requirements.",
      ],
    },
    {
      icon: "sparkles",
      title: ["المطابقة الذكية", "Intelligent matching"],
      description: [
        "اقتراحات مساعدة مع إبقاء القرار للبشر.",
        "Assistive suggestions while humans retain decisions.",
      ],
    },
    {
      icon: "activity",
      title: ["التقييم والمقابلات", "Assessment & interviews"],
      description: [
        "رحلة عادلة موثقة من البداية إلى القرار.",
        "A fair, recorded journey from start to decision.",
      ],
    },
    {
      icon: "shield",
      title: ["الانضمام والامتثال", "Onboarding & compliance"],
      description: [
        "متطلبات وصلاحيات واضحة قبل بدء العمل.",
        "Clear requirements and permissions before work begins.",
      ],
    },
    {
      icon: "globe",
      title: ["شبكة الخبراء", "Expert network"],
      description: [
        "خبرات مستقلة متاحة للمشاريع والفرق.",
        "Independent expertise available to projects and teams.",
      ],
    },
  ],
  "/market": [
    {
      icon: "cart",
      title: ["مركز البائع", "Seller hub"],
      description: [
        "إدارة العروض والطلبات من مساحة واحدة.",
        "Manage offers and requests from one space.",
      ],
    },
    {
      icon: "mail",
      title: ["طلبات المشترين", "Buyer requests"],
      description: [
        "احتياجات واضحة قابلة للمطابقة والتفاوض.",
        "Clear needs ready for matching and negotiation.",
      ],
    },
    {
      icon: "grid",
      title: ["فئات السوق", "Market categories"],
      description: [
        "تنقل ذكي بين المنتجات والخدمات والفرص.",
        "Smart navigation across products, services, and opportunities.",
      ],
    },
    {
      icon: "globe",
      title: ["الفرص العالمية", "Global opportunities"],
      description: [
        "امتداد دولي مع سياق محلي موثوق.",
        "International reach with trusted local context.",
      ],
    },
    {
      icon: "people",
      title: ["الصفقات والتفاوض", "Deals & negotiation"],
      description: [
        "مسار واضح من الاهتمام إلى الاتفاق.",
        "A clear path from interest to agreement.",
      ],
    },
    {
      icon: "shield",
      title: ["الثقة والحماية", "Trust & protection"],
      description: [
        "تحقق وضوابط تقلل المخاطر للطرفين.",
        "Verification and controls that reduce risk for both sides.",
      ],
    },
  ],
  "/software": [
    {
      icon: "settings",
      title: ["كتالوج الحلول", "Solutions catalog"],
      description: [
        "حلول مرنة قابلة للدمج والتخصيص.",
        "Flexible solutions ready for integration and adaptation.",
      ],
    },
    {
      icon: "settings",
      title: ["الروبوتات الذكية", "Intelligent robotics"],
      description: [
        "فرق روبوتية محكومة للتطوير والمتابعة.",
        "Governed robotic teams for development and follow-up.",
      ],
      href: "/software/robotics",
    },
    {
      icon: "sparkles",
      title: ["استوديو الأتمتة", "Automation studio"],
      description: [
        "تدفقات عمل مترابطة مع نقاط اعتماد بشرية.",
        "Connected workflows with human approval gates.",
      ],
    },
    {
      icon: "globe",
      title: ["التكامل وواجهات API", "Integration & APIs"],
      description: [
        "عقود واضحة تربط المحركات بمصادرها.",
        "Clear contracts connecting engines to their sources.",
      ],
    },
    {
      icon: "shield",
      title: ["الأمن والاعتمادية", "Security & reliability"],
      description: [
        "مراقبة واسترداد وضوابط تشغيلية متقدمة.",
        "Advanced monitoring, recovery, and operating controls.",
      ],
    },
    {
      icon: "settings",
      title: ["التراخيص والدعم", "Licensing & support"],
      description: [
        "إدارة دورة حياة الحل من التفعيل إلى التوسع.",
        "Manage the solution lifecycle from activation to scale.",
      ],
    },
  ],
  "/programs": [
    {
      icon: "rocket",
      title: ["المسرعات", "Accelerators"],
      description: [
        "مسارات مكثفة تنقل الأفكار إلى نتائج.",
        "Focused tracks that move ideas into outcomes.",
      ],
    },
    {
      icon: "people",
      title: ["الشراكات", "Partnerships"],
      description: [
        "تعاون منظم بين الجهات والخبرات.",
        "Structured collaboration across organizations and expertise.",
      ],
    },
    {
      icon: "wallet",
      title: ["الدعم والحوافز", "Support & incentives"],
      description: [
        "فرص دعم مرتبطة بمعايير واضحة.",
        "Support opportunities tied to clear criteria.",
      ],
    },
    {
      icon: "people",
      title: ["الإرشاد", "Mentorship"],
      description: [
        "وصول مباشر للخبرات المناسبة لكل مرحلة.",
        "Direct access to the right expertise for each stage.",
      ],
    },
    {
      icon: "activity",
      title: ["الفعاليات والمجتمع", "Events & community"],
      description: [
        "لقاءات وتجارب تبني علاقات طويلة الأثر.",
        "Encounters and experiences that build lasting relationships.",
      ],
    },
    {
      icon: "activity",
      title: ["قياس الأثر", "Impact measurement"],
      description: [
        "نتائج قابلة للتتبع بدل مؤشرات تجميلية.",
        "Traceable outcomes instead of vanity metrics.",
      ],
    },
  ],
  "/marketing": [
    {
      icon: "sparkles",
      title: ["استوديو الهوية", "Brand studio"],
      description: [
        "نظام بصري وصوت واحد عبر القنوات.",
        "One visual system and voice across channels.",
      ],
    },
    {
      icon: "trend",
      title: ["مخطط الحملات", "Campaign planner"],
      description: [
        "أهداف ورسائل ومسؤوليات ضمن رحلة واحدة.",
        "Goals, messages, and ownership in one journey.",
      ],
    },
    {
      icon: "mail",
      title: ["مركز المحتوى", "Content center"],
      description: [
        "إنشاء ومراجعة واعتماد المحتوى بوضوح.",
        "Create, review, and approve content with clarity.",
      ],
    },
    {
      icon: "activity",
      title: ["ذكاء الجمهور", "Audience intelligence"],
      description: [
        "رؤى قابلة للتفسير دون ادعاء بيانات غير متاحة.",
        "Explainable insights without claiming unavailable data.",
      ],
    },
    {
      icon: "globe",
      title: ["القنوات والشركاء", "Channels & partners"],
      description: [
        "تنسيق التوزيع والشراكات من نقطة واحدة.",
        "Coordinate distribution and partnerships from one place.",
      ],
    },
    {
      icon: "shield",
      title: ["مكتب الامتثال", "Compliance desk"],
      description: [
        "مراجعات وهوية وصلاحيات قبل النشر.",
        "Reviews, identity, and permissions before publication.",
      ],
    },
  ],
};

function pick(copy: Copy, locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

export function WorkspaceDivisions({
  locale,
  route,
}: {
  locale: Locale;
  route: string;
}) {
  const divisions =
    divisionBlueprints[route] ?? divisionBlueprints["/dashboard"];

  return (
    <section
      className="module-divisions"
      aria-labelledby="module-divisions-title"
    >
      <header className="module-divisions-heading">
        <div>
          <span>
            {locale === "ar" ? "بنية المنصة" : "Platform architecture"}
          </span>
          <h2 id="module-divisions-title">
            {locale === "ar"
              ? "مساحات مترابطة صممت للعمل معًا"
              : "Connected spaces designed to work together"}
          </h2>
        </div>
        <strong
          aria-label={
            locale === "ar"
              ? `${divisions.length} مساحات`
              : `${divisions.length} spaces`
          }
        >
          {String(divisions.length).padStart(2, "0")}
        </strong>
      </header>

      <div className="module-division-grid">
        {divisions.map((division, index) => (
          <article
            className="module-division"
            key={division.title[1]}
            style={{ "--division-index": index } as CSSProperties}
          >
            <div className="module-division-signal" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <span className="module-division-icon" aria-hidden="true">
              <Icon name={division.icon} />
            </span>
            <span className="module-division-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3>{pick(division.title, locale)}</h3>
            <p>{pick(division.description, locale)}</p>
            {division.href ? (
              <Link className="module-division-link" href={division.href}>
                {locale === "ar" ? "فتح الواجهة" : "Open interface"}
                <Icon name="arrow" />
              </Link>
            ) : (
              <span className="module-division-state">
                <i aria-hidden="true" />
                {locale === "ar" ? "جاهز للتخصيص" : "Ready to configure"}
              </span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
