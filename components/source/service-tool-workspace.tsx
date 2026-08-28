import Link from "next/link";

import { PlatformShell } from "@/components/source/source-ui";
import { Icon } from "@/components/ui/icons";
import type {
  PlatformModuleDefinition,
  PlatformServiceDefinition,
} from "@/lib/platform/catalog";
import type { PlatformNavigationMode } from "@/lib/platform/navigation";
import {
  findServiceToolSuite,
  resolveServiceToolHref,
  type ServiceToolDefinition,
  type ServiceToolSuite,
  type ToolCopy,
} from "@/lib/platform/project-academy-tools";
import type { Locale } from "@/types/i18n";

const pick = (copy: ToolCopy, locale: Locale) =>
  locale === "ar" ? copy[0] : copy[1];

export function ServiceToolDock({
  locale,
  moduleId,
  navigationMode,
  serviceSlug,
}: {
  locale: Locale;
  moduleId: string;
  navigationMode: PlatformNavigationMode;
  serviceSlug: string;
}) {
  const suite = findServiceToolSuite(moduleId, serviceSlug);
  if (!suite) return null;
  const ar = locale === "ar";

  return (
    <details className="service-tool-dock">
      <summary>
        <Icon name="grid" />
        <span>{ar ? "واجهات الأدوات" : "Tool interfaces"}</span>
        <b>{suite.tools.length.toString().padStart(2, "0")}</b>
      </summary>
      <nav aria-label={ar ? "أدوات الخدمة" : "Service tools"}>
        {suite.tools.map((item) => (
          <Link
            href={resolveServiceToolHref(
              moduleId,
              serviceSlug,
              item.slug,
              navigationMode === "preview",
            )}
            key={item.slug}
          >
            <Icon name={item.icon} />
            <span>
              <small>{item.code}</small>
              <strong>{pick(item.title, locale)}</strong>
            </span>
          </Link>
        ))}
      </nav>
    </details>
  );
}

function ToolCore({
  suite,
  tool,
}: {
  suite: ServiceToolSuite;
  tool: ServiceToolDefinition;
}) {
  return (
    <div className="service-tool-core" aria-hidden="true">
      <span className="service-tool-core__orbit service-tool-core__orbit--one" />
      <span className="service-tool-core__orbit service-tool-core__orbit--two" />
      <span className="service-tool-core__orbit service-tool-core__orbit--three" />
      <div className="service-tool-core__mark">
        <Icon name={tool.icon} />
        <i />
      </div>
      {suite.tools.map((item, index) => (
        <span
          className="service-tool-core__node"
          data-active={item.slug === tool.slug || undefined}
          key={item.slug}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
      ))}
    </div>
  );
}

export function ServiceToolWorkspace({
  locale,
  module,
  navigationMode = "live",
  service,
  suite,
  tool,
  userLabel,
}: {
  locale: Locale;
  module: PlatformModuleDefinition;
  navigationMode?: PlatformNavigationMode;
  service: PlatformServiceDefinition;
  suite: ServiceToolSuite;
  tool: ServiceToolDefinition;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const preview = navigationMode === "preview";
  const serviceHref = preview
    ? (service.previewHref ?? service.href)
    : service.href;

  return (
    <PlatformShell
      activeRoute={module.route}
      locale={locale}
      userLabel={userLabel}
    >
      <div
        className="service-tool-page"
        data-family={suite.moduleId}
        data-service={suite.serviceSlug}
      >
        <nav
          aria-label={ar ? "مسار الصفحة" : "Breadcrumb"}
          className="service-tool-breadcrumb"
        >
          <Link
            href={preview ? (module.previewHref ?? module.route) : module.route}
          >
            {pick(module.title, locale)}
          </Link>
          <Icon name="chevron" />
          <Link href={serviceHref}>{pick(service.title, locale)}</Link>
          <Icon name="chevron" />
          <span>{pick(tool.title, locale)}</span>
        </nav>

        <section
          aria-labelledby="service-tool-title"
          className="service-tool-hero glass"
        >
          <div>
            <span className="service-tool-kicker">
              {module.code} / {tool.code}
            </span>
            <h1 id="service-tool-title">{pick(tool.title, locale)}</h1>
            <p>{pick(tool.description, locale)}</p>
            <div className="service-tool-status" role="status">
              <span>
                <i aria-hidden="true" />
                {ar ? "واجهة أداة تصميمية" : "Design-only tool interface"}
              </span>
              <strong>
                {ar ? "لا حفظ أو نتائج فعلية" : "No storage or live results"}
              </strong>
            </div>
          </div>
          <div className="service-tool-hero__signal" aria-hidden="true">
            <Icon name={tool.icon} />
            <span />
            <i />
          </div>
        </section>

        <section className="service-tool-grid">
          <aside
            aria-labelledby="service-tool-inputs"
            className="service-tool-panel glass"
          >
            <header>
              <small>INPUT SIGNALS</small>
              <h2 id="service-tool-inputs">
                {ar ? "مدخلات الواجهة" : "Interface inputs"}
              </h2>
            </header>
            <div className="service-tool-inputs">
              {suite.inputs.map((input, index) => (
                <label key={input[1]}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{pick(input, locale)}</strong>
                  <input
                    aria-label={pick(input, locale)}
                    disabled
                    placeholder={ar ? "غير مفعّل" : "Inactive"}
                  />
                </label>
              ))}
            </div>
            <p>
              {ar
                ? "تُربط الحقول لاحقًا بمصدر الخدمة المعتمد."
                : "Fields connect later to the approved service provider."}
            </p>
          </aside>

          <section
            aria-label={ar ? "لوحة الأداة" : "Tool canvas"}
            className="service-tool-canvas glass"
          >
            <header>
              <span>
                <i aria-hidden="true" />
                JENAN TOOL CANVAS
              </span>
              <strong>{tool.code}</strong>
            </header>
            <ToolCore suite={suite} tool={tool} />
            <div className="service-tool-canvas__caption">
              <small>{pick(service.title, locale)}</small>
              <strong>{pick(tool.title, locale)}</strong>
              <span>
                {ar
                  ? "معاينة بنيوية قابلة للتخصيص"
                  : "Configurable structural preview"}
              </span>
            </div>
          </section>

          <aside
            aria-labelledby="service-tool-output"
            className="service-tool-panel service-tool-output glass"
          >
            <header>
              <small>TRUTHFUL OUTPUT</small>
              <h2 id="service-tool-output">
                {ar ? "مخرجات المعاينة" : "Preview outputs"}
              </h2>
            </header>
            {[
              [ar ? "الحالة" : "State", ar ? "غير محسوب" : "Not calculated"],
              [ar ? "المصدر" : "Source", ar ? "غير متصل" : "Disconnected"],
              [ar ? "الاعتماد" : "Approval", ar ? "مطلوب" : "Required"],
              [ar ? "التصدير" : "Export", ar ? "غير متاح" : "Unavailable"],
            ].map(([label, value]) => (
              <div className="service-tool-readout" key={label}>
                <span>{label}</span>
                <strong>—</strong>
                <small>{value}</small>
              </div>
            ))}
          </aside>
        </section>

        <section
          aria-labelledby="service-tool-suite"
          className="service-tool-suite glass"
        >
          <header>
            <div>
              <small>SERVICE SUITE</small>
              <h2 id="service-tool-suite">
                {ar ? "واجهات أدوات الخدمة" : "Service tool interfaces"}
              </h2>
            </div>
            <span>{suite.tools.length.toString().padStart(2, "0")}</span>
          </header>
          <nav aria-label={ar ? "التنقل بين الأدوات" : "Tool navigation"}>
            {suite.tools.map((item) => (
              <Link
                aria-current={item.slug === tool.slug ? "page" : undefined}
                className={item.slug === tool.slug ? "active" : undefined}
                href={resolveServiceToolHref(
                  suite.moduleId,
                  suite.serviceSlug,
                  item.slug,
                  preview,
                )}
                key={item.slug}
              >
                <Icon name={item.icon} />
                <span>
                  <small>{item.code}</small>
                  <strong>{pick(item.title, locale)}</strong>
                </span>
                <i aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </section>

        <section
          aria-label={ar ? "مراحل الخدمة" : "Service workflow"}
          className="service-tool-workflow"
        >
          {suite.workflow.map((stage, index) => (
            <article key={stage[1]}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{pick(stage, locale)}</strong>
              <i aria-hidden="true" />
            </article>
          ))}
          <button disabled type="button">
            <Icon name="arrow" />
            {ar ? "تشغيل الأداة — غير مفعّل" : "Run tool — inactive"}
          </button>
        </section>
      </div>
    </PlatformShell>
  );
}
