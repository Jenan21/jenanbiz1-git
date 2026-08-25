import { PlatformShell, WorldNetwork } from "@/components/source/source-ui";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Pair = readonly [string, string];

const systems: ReadonlyArray<{ icon: IconName; title: Pair; scope: Pair }> = [
  {
    icon: "shield",
    title: ["الهوية والصلاحيات", "Identity & access"],
    scope: [
      "الجلسات · الأدوار · بوابات الإدارة",
      "Sessions · roles · admin gates",
    ],
  },
  {
    icon: "grid",
    title: ["محرك المنصة", "Platform engine"],
    scope: ["المسارات · الخدمات · الأعمال", "Routes · services · workloads"],
  },
  {
    icon: "trend",
    title: ["بيانات الأسواق", "Market data"],
    scope: [
      "المزوّد · الذاكرة · حداثة البيانات",
      "Provider · cache · data freshness",
    ],
  },
  {
    icon: "activity",
    title: ["خط المراقبة", "Observability pipeline"],
    scope: ["السجلات · المقاييس · التتبّع", "Logs · metrics · traces"],
  },
];

const regions: ReadonlyArray<Pair> = [
  ["الشرق الأوسط وأفريقيا", "Middle East & Africa"],
  ["أوروبا", "Europe"],
  ["الأمريكتان", "Americas"],
  ["آسيا والمحيط الهادئ", "Asia Pacific"],
];

const tr = (locale: Locale, pair: Pair) => pair[locale === "ar" ? 0 : 1];

export function AdminGlobalHealth({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  return (
    <PlatformShell
      locale={locale}
      activeRoute="/admin/global-health"
      userLabel={userLabel}
      admin
    >
      <section className="health-hero glass">
        <div className="health-hero__copy">
          <span className="eyebrow">JENAN GLOBAL OBSERVABILITY</span>
          <h1>{ar ? "الصحة العالمية للمنصة" : "Global Platform Health"}</h1>
          <p>
            {ar
              ? "مركز إشراف موحّد للصحة والاعتمادية والحوادث. لا تُعرض أي نسبة أو حالة تشغيلية قبل وصول قياسات موثوقة."
              : "A unified command surface for health, reliability, and incidents. No operational status or percentage appears before trusted telemetry is available."}
          </p>
          <div className="health-hero__badges">
            <span>
              <i />
              {ar ? "المراقبة غير متصلة" : "Observability disconnected"}
            </span>
            <span>
              <Icon name="shield" />
              {ar ? "حالات موثقة فقط" : "Evidence-backed states only"}
            </span>
          </div>
        </div>
        <div className="health-globe" aria-hidden="true">
          <WorldNetwork />
          <span>
            <Icon name="activity" />
          </span>
          <i className="health-globe__orbit health-globe__orbit--one" />
          <i className="health-globe__orbit health-globe__orbit--two" />
        </div>
      </section>

      <section className="health-kpis">
        {[
          [
            ar ? "الخدمات المراقبة" : "Monitored services",
            "00",
            ar ? "لم تُربط" : "Not connected",
          ],
          [
            ar ? "المناطق النشطة" : "Active regions",
            "00",
            ar ? "لا قياسات" : "No telemetry",
          ],
          [
            ar ? "الحوادث المفتوحة" : "Open incidents",
            "—",
            ar ? "لا مصدر حوادث" : "No incident source",
          ],
          [
            ar ? "التوافر" : "Availability",
            "—",
            ar ? "غير قابل للحساب" : "Not computable",
          ],
        ].map(([label, value, note]) => (
          <article className="card health-kpi" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>

      <section className="health-heading">
        <div>
          <span className="eyebrow">SYSTEM HEALTH MATRIX</span>
          <h2>{ar ? "مصفوفة صحة المحركات" : "Engine health matrix"}</h2>
          <p>
            {ar
              ? "كل محرك يبقى غير معروف حتى يرسل heartbeat موثقًا."
              : "Every engine remains unknown until it emits a verified heartbeat."}
          </p>
        </div>
        <span className="badge warn">
          {ar ? "لا بث قياسات" : "No telemetry stream"}
        </span>
      </section>

      <section className="health-system-grid">
        {systems.map((system) => (
          <article className="card health-system" key={system.title[1]}>
            <header>
              <span>
                <Icon name={system.icon} />
              </span>
              <b>{ar ? "غير معروف" : "Unknown"}</b>
            </header>
            <h3>{tr(locale, system.title)}</h3>
            <p>{tr(locale, system.scope)}</p>
            <div>
              <span>{ar ? "آخر نبضة" : "Last heartbeat"}</span>
              <strong>—</strong>
            </div>
          </article>
        ))}
      </section>

      <section className="health-command-grid">
        <article className="card regional-health">
          <header>
            <div>
              <span className="eyebrow">REGIONAL PRESENCE</span>
              <h2>{ar ? "التغطية الإقليمية" : "Regional coverage"}</h2>
            </div>
            <span className="badge">{ar ? "0 مناطق" : "0 regions"}</span>
          </header>
          <div className="regional-health__map">
            <WorldNetwork />
            <span>
              {ar
                ? "بانتظار مزوّد البنية التحتية"
                : "Awaiting infrastructure provider"}
            </span>
          </div>
          <div className="regional-health__list">
            {regions.map((region) => (
              <span key={region[1]}>
                <i />
                <strong>{tr(locale, region)}</strong>
                <small>{ar ? "غير مهيأة" : "Unconfigured"}</small>
              </span>
            ))}
          </div>
        </article>

        <aside className="card health-objectives">
          <header>
            <Icon name="trend" />
            <div>
              <span className="eyebrow">RELIABILITY OBJECTIVES</span>
              <h2>{ar ? "أهداف مستوى الخدمة" : "Service level objectives"}</h2>
            </div>
          </header>
          <div>
            {[
              [
                ar ? "التوافر المستهدف" : "Availability target",
                ar ? "غير محدد" : "Not defined",
              ],
              [
                ar ? "زمن الاستجابة" : "Response latency",
                ar ? "غير محدد" : "Not defined",
              ],
              [
                ar ? "ميزانية الأخطاء" : "Error budget",
                ar ? "غير محدد" : "Not defined",
              ],
              [
                ar ? "مدة الاستعادة" : "Recovery time",
                ar ? "غير محدد" : "Not defined",
              ],
            ].map(([label, state]) => (
              <span key={label}>
                <strong>{label}</strong>
                <small>{state}</small>
                <i />
              </span>
            ))}
          </div>
          <p>
            <Icon name="shield" />
            {ar
              ? "لا يمكن إعلان SLA قبل تعريف القياس والمصدر وسياسة التنبيه."
              : "No SLA can be published before its measurement, source, and alert policy are defined."}
          </p>
        </aside>
      </section>

      <section className="card incident-desk">
        <header>
          <div>
            <span className="eyebrow">INCIDENT COMMAND</span>
            <h2>{ar ? "مكتب الحوادث والاستجابة" : "Incident response desk"}</h2>
          </div>
          <button className="button button--primary" type="button" disabled>
            {ar ? "إنشاء حادث — غير متاح" : "Create incident — unavailable"}
          </button>
        </header>
        <div>
          <Icon name="check" />
          <strong>{ar ? "لا توجد بيانات حوادث" : "No incident data"}</strong>
          <p>
            {ar
              ? "عند ربط نظام المراقبة ستظهر الحوادث الموثقة وخط الزمن والمالك وخطة الاستعادة."
              : "Once observability is connected, verified incidents, timeline, owner, and recovery plan will appear here."}
          </p>
        </div>
      </section>
    </PlatformShell>
  );
}
