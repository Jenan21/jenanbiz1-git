import Link from "next/link";

import {
  ModuleIdentityRail,
  ModuleIdentityScene,
} from "@/components/source/module-identity";
import { PlatformShell } from "@/components/source/source-ui";
import {
  hasSpecializedServiceTemplate,
  ServiceTemplateRenderer,
} from "@/components/source/service-template-registry";
import { Icon } from "@/components/ui/icons";
import {
  findPlatformService,
  readPlatformCatalog,
  type CatalogCopy,
} from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

type ScreenDefinition = readonly [title: CatalogCopy, description: CatalogCopy];

const serviceScreens: Readonly<Record<string, readonly ScreenDefinition[]>> = {
  projects: [
    [
      ["واجهة الملخص", "Overview screen"],
      [
        "عرض بصري منظم لموضوع المشروع.",
        "An organized visual presentation of the project topic.",
      ],
    ],
    [
      ["منطقة المحتوى", "Content area"],
      [
        "تقسيمات واضحة للمعلومات والعناصر.",
        "Clear divisions for information and elements.",
      ],
    ],
    [
      ["شاشة التفاصيل", "Details screen"],
      [
        "مساحة موسعة لعرض تفاصيل الخدمة.",
        "An expanded space for service details.",
      ],
    ],
    [
      ["مكتبة المستندات", "Document library"],
      [
        "واجهة للملفات والقوالب المستقبلية.",
        "An interface for future files and templates.",
      ],
    ],
  ],
  academy: [
    [
      ["واجهة المادة", "Material screen"],
      [
        "عرض تعليمي هادئ وواضح للمحتوى.",
        "A calm, clear learning presentation for content.",
      ],
    ],
    [
      ["مكتبة الأكاديمية", "Academy library"],
      [
        "تصنيف بصري للدراسات والمواد.",
        "Visual categorization for studies and materials.",
      ],
    ],
    [
      ["شاشة العرض", "Presentation screen"],
      [
        "مساحة للندوات والأبحاث والدورات.",
        "A space for seminars, research, and courses.",
      ],
    ],
    [
      ["تفاصيل المحتوى", "Content details"],
      ["صفحة تفصيلية موحدة لكل عنصر.", "A unified detail page for every item."],
    ],
  ],
  market: [
    [
      ["واجهة العرض", "Showcase screen"],
      [
        "عرض واسع للمشروعات والأنشطة.",
        "A wide showcase for projects and businesses.",
      ],
    ],
    [
      ["معرض الوسائط", "Media gallery"],
      [
        "مساحة مرئية للصور والعناصر التعريفية.",
        "A visual space for imagery and identity elements.",
      ],
    ],
    [
      ["بطاقة التفاصيل", "Details profile"],
      [
        "تقسيم احترافي لمعلومات العرض.",
        "A professional layout for listing information.",
      ],
    ],
    [
      ["واجهة الاستكشاف", "Discovery screen"],
      [
        "عرض منظم للفئات والعناصر المتاحة.",
        "An organized view of available categories and items.",
      ],
    ],
  ],
  talent: [
    [
      ["الملف المهني", "Professional profile"],
      [
        "واجهة للهوية والخبرة المهنية.",
        "An interface for professional identity and experience.",
      ],
    ],
    [
      ["شاشة السيرة الذاتية", "Resume screen"],
      [
        "عرض احترافي ومنظم للسيرة الذاتية.",
        "A professional, structured resume presentation.",
      ],
    ],
    [
      ["واجهة البحث", "Discovery screen"],
      [
        "تقسيم بصري للفرص أو السير الذاتية.",
        "A visual layout for opportunities or resumes.",
      ],
    ],
    [
      ["صفحة المنشأة", "Organization page"],
      [
        "واجهة تعريفية للمنشأة واحتياجاتها.",
        "An identity page for the organization and its needs.",
      ],
    ],
  ],
  software: [
    [
      ["معرض الأدوات", "Tools gallery"],
      [
        "واجهة موحدة لعرض الأدوات المتاحة.",
        "A unified interface for available tools.",
      ],
    ],
    [
      ["مساحة التصميم", "Design canvas"],
      [
        "شاشة واسعة للتصميم والإعداد مستقبلاً.",
        "A wide screen for future design and preparation.",
      ],
    ],
    [
      ["مكتبة القوالب", "Template library"],
      [
        "عرض منظم للقوالب والأنماط.",
        "An organized presentation of templates and styles.",
      ],
    ],
    [
      ["معاينة المستند", "Document preview"],
      [
        "واجهة معاينة للسيرة والخطاب والورق الرسمي.",
        "A preview interface for resumes, letters, and letterheads.",
      ],
    ],
  ],
  programs: [
    [
      ["واجهة البرنامج", "Program screen"],
      [
        "هوية مستقلة لكل برنامج مساند.",
        "An independent identity for each support program.",
      ],
    ],
    [
      ["لوحة العرض", "Overview board"],
      ["تقسيم بصري لأقسام البرنامج.", "A visual layout for program sections."],
    ],
    [
      ["شاشة السجلات", "Records screen"],
      [
        "واجهة مستقبلية للعناصر والسجلات.",
        "A future interface for items and records.",
      ],
    ],
    [
      ["واجهة التقارير", "Reports screen"],
      [
        "مساحة عرض للتقارير والملخصات لاحقاً.",
        "A future display space for reports and summaries.",
      ],
    ],
  ],
  marketing: [
    [
      ["واجهة الحملة", "Campaign screen"],
      [
        "عرض بصري لهوية الموضوع التسويقي.",
        "A visual presentation for the marketing subject.",
      ],
    ],
    [
      ["معرض الإعلانات", "Advertising gallery"],
      [
        "مساحة لعرض النماذج والتصاميم.",
        "A space for advertising concepts and designs.",
      ],
    ],
    [
      ["شاشة الهوية", "Identity screen"],
      [
        "تنسيق موحد للرسائل والأصول البصرية.",
        "A unified layout for messages and visual assets.",
      ],
    ],
    [
      ["معاينة الجمهور", "Audience preview"],
      [
        "واجهة تصميمية لشرائح الجمهور دون بيانات تشغيلية.",
        "A design-only audience view without operational data.",
      ],
    ],
  ],
};

function pick(copy: CatalogCopy, locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

export async function getDivisionDetail(moduleName: string, slug: string) {
  const [match, snapshot] = await Promise.all([
    findPlatformService(moduleName, slug),
    readPlatformCatalog(),
  ]);
  if (!match || match.module.id === "dashboard") return null;
  const index = match.module.services.findIndex(
    (item) => item.id === match.service.id,
  );
  if (index < 0) return null;
  return {
    catalogVersion: snapshot.version,
    division: match.service,
    href: match.service.href,
    index,
    module: match.module,
    moduleName: match.module.id,
    moduleRoute: match.module.route,
    sourceState: snapshot.sourceState,
  } as const;
}

export type DivisionDetail = NonNullable<
  Awaited<ReturnType<typeof getDivisionDetail>>
>;

export function DivisionWorkspace({
  detail,
  locale,
  userLabel,
}: {
  detail: DivisionDetail;
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const title = pick(detail.division.title, locale);
  const description = pick(detail.division.description, locale);
  const screens = serviceScreens[detail.moduleName] ?? serviceScreens.projects;

  if (hasSpecializedServiceTemplate(detail.division)) {
    return (
      <ServiceTemplateRenderer
        locale={locale}
        module={detail.module}
        service={detail.division}
        userLabel={userLabel}
      />
    );
  }

  return (
    <PlatformShell
      locale={locale}
      activeRoute={detail.moduleRoute}
      userLabel={userLabel}
    >
      <nav
        className="division-breadcrumb"
        aria-label={ar ? "مسار الصفحة" : "Breadcrumb"}
      >
        <Link href={detail.moduleRoute}>
          {pick(detail.module.title, locale)}
        </Link>
        <Icon name="chevron" />
        <span>{title}</span>
      </nav>

      <div className="module-cinema">
        <ModuleIdentityRail
          activeHref={detail.href}
          locale={locale}
          route={detail.moduleRoute}
        />
        <section className="division-hero glass">
          <div className="division-hero__copy">
            <span className="eyebrow">
              JENAN SPACE / {String(detail.index + 1).padStart(2, "0")}
            </span>
            <span className="division-hero__icon" aria-hidden="true">
              <Icon name={detail.division.icon} />
            </span>
            <h1>{title}</h1>
            <p>{description}</p>
            <div className="division-hero__status">
              <span>
                <i />
                {ar ? "واجهة مثبتة في الكتالوج" : "Catalog-defined interface"}
              </span>
              <span>
                {ar ? "تصميم فقط — غير تشغيلية" : "Design only — inactive"}
              </span>
            </div>
          </div>
          <div className="division-hero__visual" aria-hidden="true">
            <ModuleIdentityScene route={detail.moduleRoute} />
          </div>
        </section>
      </div>

      <section
        className="service-screen-section"
        aria-labelledby="service-screen-title"
      >
        <header className="division-section-heading">
          <div>
            <span>{ar ? "بنية الواجهة" : "Interface structure"}</span>
            <h2 id="service-screen-title">
              {ar
                ? "شاشات قابلة للتخصيص من تعريف الخدمة"
                : "Screens configurable from the service definition"}
            </h2>
          </div>
          <span className="division-state-pill">
            {ar ? "غير مفعلة" : "Inactive"}
          </span>
        </header>

        <div className="service-screen-grid">
          {screens.map(([screenTitle, screenDescription], index) => (
            <article className="service-screen-card glass" key={screenTitle[1]}>
              <div className="service-screen-card__preview" aria-hidden="true">
                <span />
                <i />
                <i />
                <i />
              </div>
              <span className="service-screen-card__number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2>{pick(screenTitle, locale)}</h2>
              <p>{pick(screenDescription, locale)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="service-foundation glass">
        <div>
          <Icon name="grid" />
          <span>
            <small>CATALOG FOUNDATION / V{detail.catalogVersion}</small>
            <strong>
              {ar
                ? "هذه الصفحة مولدة من تعريف الكتالوج"
                : "This page is generated from the catalog definition"}
            </strong>
          </span>
        </div>
        <p>
          {ar
            ? "لا توجد وظائف تشغيلية أو بيانات حقيقية. يمكن لمزود لوحة الإدارة لاحقاً إضافة الخدمات أو تحديثها أو حذفها مع بقاء هذه البنية كما هي."
            : "No operational functions or real data are active. A future admin provider can add, update, or remove services while this structure remains unchanged."}
        </p>
        <Link href={detail.moduleRoute}>
          <Icon name="arrow" />
          {ar ? "العودة إلى القسم" : "Back to section"}
        </Link>
      </section>
    </PlatformShell>
  );
}
