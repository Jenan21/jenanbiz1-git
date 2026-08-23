import Link from "next/link";
import { LogoPlaceholder } from "@/components/layout/logo-placeholder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { getRequestDictionary } from "@/lib/i18n/server";

const featureItems = [
  { label: "Operations", value: "Unified control" },
  { label: "Intelligence", value: "AI-guided insights" },
  { label: "Trust", value: "Enterprise-grade" },
  { label: "Scale", value: "Global-ready" },
];

export default async function HomePage() {
  const { locale } = await getRequestDictionary();
  const ar = locale === "ar";

  const heroTitle = ar
    ? "منصة عالمية لإدارة الأعمال بذكاء ووضوح"
    : "A global platform for smarter, clearer business operations";

  const heroText = ar
    ? "Jenan BIZ يربط بين الإدارة، البيانات، الاستراتيجية، والتجربة الرقمية في منصة واحدة مصممة للنمو الدولي والسرعة التشغيلية."
    : "Jenan BIZ brings executive visibility, intelligent workflows, and a unified digital foundation into one platform built for global growth and operational speed.";

  return (
    <main className="landing-page">
      <div className="aurora aurora--one" />
      <div className="aurora aurora--two" />
      <div className="grid-plane" />

      <header className="landing-header">
        <div className="brand-cluster">
          <LogoPlaceholder compact />
          <div>
            <strong>Jenan BIZ</strong>
            <small>{ar ? "منصة الأعمال العالمية" : "Global business platform"}</small>
          </div>
        </div>

        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#platform">{ar ? "المنصة" : "Platform"}</a>
          <a href="#solutions">{ar ? "الحلول" : "Solutions"}</a>
          <a href="#results">{ar ? "النتائج" : "Results"}</a>
        </nav>

        <LanguageSwitcher
          locale={locale}
          label={ar ? "التبديل إلى الإنجليزية" : "Switch to Arabic"}
        />
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">
            <Icon name="sparkles" />
            {ar ? "أعمال أذكى • رؤية أوضح • نمو أوسع" : "Smarter business • clearer vision • broader growth"}
          </p>
          <h1>{heroTitle}</h1>
          <p className="hero-text">{heroText}</p>

          <div className="home-actions">
            <Link href="/login">
              <Button>
                {ar ? "ابدأ الآن" : "Get started"}
                <Icon name="arrow" />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="secondary">
                {ar ? "استعراض اللوحة" : "Preview dashboard"}
              </Button>
            </Link>
          </div>

          <ul className="trust-list" aria-label="Platform trust indicators">
            <li>{ar ? "أمان Enterprise" : "Enterprise security"}</li>
            <li>{ar ? "تجربة عربية/إنجليزية" : "Arabic + English"}</li>
            <li>{ar ? "جاهز للتوسع" : "Built to scale"}</li>
          </ul>
        </div>

        <Card className="hero-panel">
          <div className="panel-header">
            <span>{ar ? "لوحة التشغيل" : "Operating pulse"}</span>
            <span className="status-pill">{ar ? "نشط" : "Live"}</span>
          </div>

          <div className="stat-grid">
            <div>
              <strong>24.8K</strong>
              <small>{ar ? "معاملات هذا الشهر" : "transactions this month"}</small>
            </div>
            <div>
              <strong>96.4%</strong>
              <small>{ar ? "توصيل مستقر" : "delivery reliability"}</small>
            </div>
            <div>
              <strong>11.2x</strong>
              <small>{ar ? "سرعة التشغيل" : "operational speed"}</small>
            </div>
            <div>
              <strong>99.9%</strong>
              <small>{ar ? "توافر المنصة" : "platform uptime"}</small>
            </div>
          </div>

          <div className="mini-chart" aria-hidden="true">
            <span style={{ height: "34%" }} />
            <span style={{ height: "52%" }} />
            <span style={{ height: "46%" }} />
            <span style={{ height: "68%" }} />
            <span style={{ height: "84%" }} />
            <span style={{ height: "96%" }} />
            <span style={{ height: "88%" }} />
          </div>

          <div className="feature-pills">
            {featureItems.map((item) => (
              <span key={item.label}>{item.value}</span>
            ))}
          </div>
        </Card>
      </section>

      <section id="platform" className="section-block">
        <div className="section-heading">
          <p className="eyebrow eyebrow--small">
            <Icon name="sparkles" />
            {ar ? "لماذا Jenan BIZ" : "Why Jenan BIZ"}
          </p>
          <h2>{ar ? "منصة متكاملة لكل مرحلة من نمو الأعمال" : "One platform for every stage of growth"}</h2>
        </div>

        <div className="value-grid">
          <Card className="value-card">
            <span className="card-icon">01</span>
            <h3>{ar ? "التحكم التشغيلي" : "Operational control"}</h3>
            <p>
              {ar
                ? "إدارة المهام، الأداء، والخروج من الأنظمة المتفرقة في لوحة واحدة."
                : "Manage tasks, execution, and operational metrics in one unified control layer."}
            </p>
          </Card>

          <Card className="value-card">
            <span className="card-icon">02</span>
            <h3>{ar ? "الذكاء التجاري" : "Business intelligence"}</h3>
            <p>
              {ar
                ? "تبصرات فورية تساعد الفرق على اتخاذ قرارات أسرع وأكثر ثقة."
                : "Fast, data-backed insight gives teams sharper decisions and better execution."}
            </p>
          </Card>

          <Card className="value-card">
            <span className="card-icon">03</span>
            <h3>{ar ? "التعاون العالمي" : "Global collaboration"}</h3>
            <p>
              {ar
                ? "دعم للفرق متعددة اللغات والمناطق مع تجربة احترافية وآمنة."
                : "Cross-region, cross-language teamwork with a polished and secure experience."}
            </p>
          </Card>
        </div>
      </section>

      <section id="solutions" className="section-block section-block--split">
        <div className="section-copy">
          <p className="eyebrow eyebrow--small">
            <Icon name="sparkles" />
            {ar ? "الحلول" : "Solutions"}
          </p>
          <h2>{ar ? "مصممة لتناسب فرق الأعمال الحديثة" : "Built for modern organizations"}</h2>
          <ul className="check-list">
            <li>{ar ? "لوحة القيادة بالعربية والإنجليزية" : "Executive dashboards in Arabic and English"}</li>
            <li>{ar ? "تجربة مستخدم احترافية ومتجاوبة" : "Premium user experience across devices"}</li>
            <li>{ar ? "هيكل جاهز للتوسع والاعتماد المؤسسي" : "Scalable architecture for enterprise growth"}</li>
            <li>{ar ? "بيئة آمنة وواضحة للفرق والإدارة" : "Secure and transparent decision flows"}</li>
          </ul>
        </div>

        <div className="stack-panel glass-panel">
          <div className="stack-row">
            <span>{ar ? "منصة" : "Platform"}</span>
            <strong>{ar ? "الهوية الرقمية" : "Digital identity"}</strong>
          </div>
          <div className="stack-row">
            <span>{ar ? "إدارة" : "Management"}</span>
            <strong>{ar ? "العمليات" : "Operations"}</strong>
          </div>
          <div className="stack-row">
            <span>{ar ? "ذكاء" : "Intelligence"}</span>
            <strong>{ar ? "تحليلات الأعمال" : "Business insights"}</strong>
          </div>
          <div className="stack-row">
            <span>{ar ? "أمان" : "Security"}</span>
            <strong>{ar ? "الوصول والرقابة" : "Access control"}</strong>
          </div>
        </div>
      </section>

      <section id="results" className="section-block metrics-band">
        <div>
          <strong>90%</strong>
          <span>{ar ? "تسريع في اتخاذ القرار" : "faster decision cycles"}</span>
        </div>
        <div>
          <strong>3x</strong>
          <span>{ar ? "أسرع في تنسيق الفرق" : "faster team alignment"}</span>
        </div>
        <div>
          <strong>24/7</strong>
          <span>{ar ? "رؤية تشغيلية مستمرة" : "continuous operational visibility"}</span>
        </div>
      </section>

      <footer className="landing-footer">
        <span>© 2026 Jenan BIZ</span>
        <div>
          <Link href="/admin">{ar ? "بوابة الإدارة" : "Admin portal"}</Link>
          <Link href="/login">{ar ? "تسجيل الدخول" : "Sign in"}</Link>
        </div>
      </footer>
    </main>
  );
}
