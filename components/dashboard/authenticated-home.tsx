import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];

const services: ReadonlyArray<{
  href: string;
  icon: IconName;
  title: Copy;
  description: Copy;
  tone: string;
}> = [
  {
    href: "/projects",
    icon: "barChart",
    title: ["المشاريع", "Projects"],
    description: ["تحليل ودراسة وتقييم وبدء مشروعك", "Analyze, assess, and launch projects"],
    tone: "blue",
  },
  {
    href: "/academy",
    icon: "graduation",
    title: ["الأكاديمية", "Academy"],
    description: ["دروس ودورات وأبحاث في مجال الأعمال", "Business courses, studies, and research"],
    tone: "cyan",
  },
  {
    href: "/software",
    icon: "grid",
    title: ["البرمجيات والأدوات", "Software & tools"],
    description: ["أدوات ذكية للإدارة وتنمية أعمالك", "Smart tools to operate and grow"],
    tone: "gold",
  },
  {
    href: "/market",
    icon: "cart",
    title: ["سوق جنان", "Jenan Market"],
    description: ["بيع وشراء الأعمال والمتاجر والعقارات", "Buy and sell businesses and assets"],
    tone: "sky",
  },
  {
    href: "/talent",
    icon: "people",
    title: ["التوظيف", "Talent"],
    description: ["فرص وظيفية وكفاءات عالية", "Jobs and high-quality talent"],
    tone: "violet",
  },
  {
    href: "/marketing",
    icon: "megaphone",
    title: ["التسويق", "Marketing"],
    description: ["حملات وتسويق لجذب العملاء", "Campaigns that attract customers"],
    tone: "emerald",
  },
];

const nav: ReadonlyArray<{ href: string; icon: IconName; label: Copy }> = [
  { href: "/dashboard", icon: "dashboard", label: ["الرئيسية", "Home"] },
  { href: "/talent", icon: "briefcase", label: ["التوظيف", "Talent"] },
  { href: "/software", icon: "grid", label: ["البرمجيات والأدوات", "Software & tools"] },
  { href: "/projects", icon: "briefcase", label: ["المشاريع", "Projects"] },
  { href: "/academy", icon: "graduation", label: ["الأكاديمية", "Academy"] },
  { href: "/market", icon: "cart", label: ["المنصة", "Market"] },
];

const assurances: ReadonlyArray<{ icon: IconName; title: Copy; note: Copy }> = [
  { icon: "brain", title: ["ذكاء اصطناعي متقدم", "Advanced AI"], note: ["يدعم قرارك", "Decision support"] },
  { icon: "globe", title: ["شبكة فرص عالمية", "Global opportunity"], note: ["في مختلف القطاعات", "Across sectors"] },
  { icon: "shield", title: ["شبكة وخصوصية عالية", "Private and secure"], note: ["لحماية بياناتك", "Protecting your data"] },
  { icon: "shield", title: ["أمان فرص عالمية", "Trusted opportunity"], note: ["في مختلف القطاعات", "Across sectors"] },
  { icon: "settings", title: ["دعم فني متخصص", "Expert support"], note: ["من مصادر عالمية", "From trusted sources"] },
  { icon: "sparkles", title: ["تحديثات مستمرة", "Continuous updates"], note: ["وخدمات متطورة", "Evolving services"] },
];

function copy(value: Copy, locale: Locale) {
  return locale === "ar" ? value[0] : value[1];
}

export function AuthenticatedHome({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";

  return (
    <main
      className="authenticated-home"
      data-dashboard-route="/dashboard"
      data-dashboard-source="AUTHENTICATED_PLATFORM"
      dir={ar ? "rtl" : "ltr"}
    >
      <header className="authenticated-home__header">
        <Link className="authenticated-home__brand" href="/dashboard" aria-label="Jenan PRO">
          <span aria-hidden="true"><i /><i /></span>
          <strong>Jenan <b>PRO</b></strong>
        </Link>
        <nav aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
          {nav.map((item) => (
            <Link
              className={item.href === "/dashboard" ? "is-active" : undefined}
              href={item.href}
              key={item.href}
            >
              <Icon name={item.icon} />
              {copy(item.label, locale)}
            </Link>
          ))}
        </nav>
        <div className="authenticated-home__tools">
          <button type="button" disabled aria-label={ar ? "البحث غير متاح حاليًا" : "Search is currently unavailable"}><Icon name="search" /></button>
          <LanguageSwitcher locale={locale} label={ar ? "Switch to English" : "التبديل إلى العربية"} />
          <span className="user-chip" title={userLabel}>{userLabel}</span>
          <LogoutButton
            label={ar ? "خروج" : "Logout"}
            errorMessage={
              ar
                ? "تعذر تسجيل الخروج. تحقق من اتصالك وحاول مجددًا."
                : "Could not log out. Check your connection and try again."
            }
          />
        </div>
      </header>

      <section className="authenticated-home__hero">
        <div className="authenticated-home__opportunities">
          <h2>{ar ? "فرص عالمية اليوم" : "Global opportunities today"}</h2>
          {[ar ? "فرص جديدة" : "New opportunities", ar ? "مستثمرون نشطون" : "Active investors", ar ? "شراكات استراتيجية" : "Strategic partnerships"].map((label, index) => (
            <article key={label}>
              <Icon name={index === 0 ? "rocket" : index === 1 ? "people" : "briefcase"} />
              <strong>—</strong>
              <span>{label}</span>
              <small>{ar ? "غير متاح حاليًا" : "Currently unavailable"}</small>
            </article>
          ))}
        </div>
        <div className="authenticated-home__globe" aria-hidden="true" />
        <div className="authenticated-home__hero-copy">
          <h1>{ar ? <>فرص عالمية<br /><em>لأعمال أكبر</em></> : <>Global opportunities<br /><em>for bigger business</em></>}</h1>
          <strong>{ar ? "أدوات ذكية · تحليلات دقيقة · شراكات حقيقية" : "Smart tools · accurate insights · real partnerships"}</strong>
          <p>{ar ? "حوّل أفكارك إلى فرص عالمية عبر منظومة أعمال مترابطة." : "Turn your ideas into global opportunities through one connected business ecosystem."}</p>
          <Link href="/projects">{ar ? "ابدأ مشروعك" : "Start a project"} <Icon name="arrow" /></Link>
        </div>
      </section>

      <section className="authenticated-home__primary">
        <section className="authenticated-home__services" aria-label={ar ? "خدمات المنصة" : "Platform services"}>
          {services.map((service) => (
            <Link className={`authenticated-home__service tone-${service.tone}`} href={service.href} key={service.href}>
              <span><Icon name={service.icon} /></span>
              <h2>{copy(service.title, locale)}</h2>
              <p>{copy(service.description, locale)}</p>
              <b>{ar ? "اكتشف المزيد" : "Discover more"} <Icon name="arrow" /></b>
            </Link>
          ))}
        </section>
        <article className="authenticated-home__market">
          <header><h2>{ar ? "نبض الأسواق العالمية" : "Global market pulse"}</h2><span>{ar ? "بيانات مباشرة غير متاحة" : "Live data unavailable"}</span></header>
          <div className="authenticated-home__market-empty"><Icon name="barChart" /><strong>—</strong><p>{ar ? "سيظهر السوق عند اتصال مصدر بيانات معتمد." : "Market data appears when an approved source is connected."}</p></div>
        </article>
      </section>

      <section className="authenticated-home__insights">
        <article className="authenticated-home__success">
          <header><h2>{ar ? "فرص نجاح" : "Success opportunities"}</h2><Link href="/projects">{ar ? "عرض الكل" : "View all"}</Link></header>
          <div><Icon name="globe" /><strong>{ar ? "ابدأ قصتك العالمية" : "Start your global story"}</strong><p>{ar ? "استكشف المشاريع والفرص المتاحة داخل أقسام المنصة." : "Explore projects and opportunities across the platform."}</p><Link href="/projects">{ar ? "استكشف" : "Explore"} <Icon name="arrow" /></Link></div>
        </article>
        <article className="authenticated-home__distribution">
          <h2>{ar ? "توزيع المستخدمين" : "User distribution"}</h2>
          <div className="authenticated-home__donut"><span>—<small>{ar ? "غير متاح" : "Unavailable"}</small></span></div>
          <p>{ar ? "تظهر البيانات بعد توفر نشاط موثوق." : "Data appears after verified activity is available."}</p>
        </article>
        <article className="authenticated-home__stats">
          <h2>{ar ? "إحصائيات المنصة" : "Platform statistics"}</h2>
          <div>{[ar ? "مستخدم نشط" : "Active users", ar ? "نمو شهري" : "Monthly growth", ar ? "مشروع جديد" : "New projects", ar ? "قيمة الفرص" : "Opportunity value"].map((label) => <span key={label}><Icon name="trend" /><b>—</b><small>{label}</small></span>)}</div>
        </article>
        <article className="authenticated-home__news">
          <header><h2>{ar ? "أحدث الأخبار والتحديثات" : "Latest news and updates"}</h2></header>
          <div><Icon name="sparkles" /><strong>{ar ? "لا توجد أخبار منشورة حاليًا" : "No published news yet"}</strong><p>{ar ? "ستظهر التحديثات المعتمدة هنا." : "Approved updates will appear here."}</p></div>
        </article>
      </section>

      <section className="authenticated-home__assurances">
        {assurances.map((item) => <span key={item.title[0]}><Icon name={item.icon} /><i><b>{copy(item.title, locale)}</b><small>{copy(item.note, locale)}</small></i></span>)}
      </section>

      <footer className="authenticated-home__footer">
        <strong>Jenan <b>PRO</b></strong>
        <nav><Link href="/dashboard">{ar ? "الرئيسية" : "Home"}</Link><Link href="/">{ar ? "عن المنصة" : "About"}</Link></nav>
        <small>© 2026 Jenan PRO</small>
      </footer>
    </main>
  );
}
