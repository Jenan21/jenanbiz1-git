import Link from "next/link";
import { notFound } from "next/navigation";

import { PlatformShell } from "@/components/custom/platform-shell";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { findPlatformModule, findPlatformService } from "@/lib/platform/catalog";
import { getRequestDictionary } from "@/lib/i18n/server";

const standalonePages = {
  "/account": {
    title: ["الحساب", "Account"],
    eyebrow: ["الهوية والإعدادات", "Identity and settings"],
    description: ["إدارة بيانات الحساب وتفضيلات المنصة من مكان واحد.", "Manage account details and platform preferences in one place."],
  },
  "/benefits": {
    title: ["المزايا", "Benefits"],
    eyebrow: ["قيمة المنصة", "Platform value"],
    description: ["استعرض المزايا المتاحة لأعمالك ضمن منظومة جنان.", "Explore the capabilities available to your business across Jenan."],
  },
  "/pricing": {
    title: ["الباقات", "Plans"],
    eyebrow: ["خيارات واضحة", "Clear options"],
    description: ["اختر نطاق الخدمات الملائم لمرحلة أعمالك.", "Choose the service scope that fits your business stage."],
  },
} as const;

function pick(copy: readonly [string, string], locale: "ar" | "en") {
  return locale === "ar" ? copy[0] : copy[1];
}

export async function ModulePage({ route }: { route: string }) {
  const [{ locale }, user, module] = await Promise.all([
    getRequestDictionary(),
    requireUser(route),
    findPlatformModule(route),
  ]);
  const standalone = standalonePages[route as keyof typeof standalonePages];
  if (!module && !standalone) notFound();

  const title = module?.title ?? standalone!.title;
  const eyebrow = module?.eyebrow ?? standalone!.eyebrow;
  const description = module?.description ?? standalone!.description;
  const ar = locale === "ar";

  return (
    <PlatformShell locale={locale} activeRoute={route} userLabel={user.profile?.displayName ?? user.email}>
      <section className="workspace-overview">
        <header className="workspace-overview__header">
          <div>
            <span className="workspace-overview__eyebrow">{pick(eyebrow, locale)}</span>
            <h1>{pick(title, locale)}</h1>
            <p>{pick(description, locale)}</p>
          </div>
          <span className="workspace-overview__status">
            <i aria-hidden="true" />
            {ar ? "جاهز للعمل" : "Ready"}
          </span>
        </header>

        {module?.stages.length ? (
          <ol className="workspace-steps">
            {module.stages.map((stage, index) => (
              <li key={stage[0]}><b>{String(index + 1).padStart(2, "0")}</b><span>{pick(stage, locale)}</span></li>
            ))}
          </ol>
        ) : null}

        {module?.services.length ? (
          <div className="workspace-services">
            {module.services.map((service) => (
              <Link href={service.href} className="workspace-service" key={service.id}>
                <span className="workspace-service__icon"><Icon name={service.icon} /></span>
                <span><strong>{pick(service.title, locale)}</strong><small>{pick(service.description, locale)}</small></span>
                <Icon name="arrow" aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="workspace-empty">
            <Icon name="settings" />
            <p>{ar ? "ستظهر الإعدادات المتاحة هنا عند تفعيلها." : "Available settings will appear here when enabled."}</p>
          </div>
        )}
      </section>
    </PlatformShell>
  );
}

export async function ServicePage({ moduleId, slug }: { moduleId: string; slug: string }) {
  const detail = await findPlatformService(moduleId, slug);
  if (!detail) notFound();
  const route = detail.service.href;
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser(route)]);
  const ar = locale === "ar";

  return (
    <PlatformShell locale={locale} activeRoute={detail.module.route} userLabel={user.profile?.displayName ?? user.email}>
      <section className="workspace-overview workspace-overview--service">
        <Link href={detail.module.route} className="workspace-back"><Icon name="arrow" />{pick(detail.module.title, locale)}</Link>
        <header className="workspace-overview__header">
          <div>
            <span className="workspace-overview__eyebrow">{detail.module.code}</span>
            <h1>{pick(detail.service.title, locale)}</h1>
            <p>{pick(detail.service.description, locale)}</p>
          </div>
          <span className="workspace-service__icon workspace-service__icon--large"><Icon name={detail.service.icon} /></span>
        </header>
        <div className="workspace-empty">
          <Icon name="activity" />
          <p>{ar ? "مساحة الخدمة جاهزة للربط بالبيانات والعمليات الفعلية." : "This service workspace is ready for live data and operational connections."}</p>
        </div>
      </section>
    </PlatformShell>
  );
}
