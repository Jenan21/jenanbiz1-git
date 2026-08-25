import { PlatformShell } from "@/components/source/source-ui";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Pair = readonly [string, string];

const layers: ReadonlyArray<{
  code: string;
  icon: IconName;
  title: Pair;
  description: Pair;
}> = [
  {
    code: "SRC",
    icon: "globe",
    title: ["المصادر المعتمدة", "Approved sources"],
    description: [
      "واجهات API والأنظمة الداخلية بعد اعتمادها فقط.",
      "APIs and internal systems only after approval.",
    ],
  },
  {
    code: "ADP",
    icon: "settings",
    title: ["محولات المزوّدين", "Provider adapters"],
    description: [
      "عقد موحّد يعزل اختلافات كل مزوّد.",
      "One typed contract isolates provider differences.",
    ],
  },
  {
    code: "CAC",
    icon: "grid",
    title: ["ذاكرة الخادم", "Server cache"],
    description: [
      "سياسات انتهاء وتحديث دون ادعاء بيانات حية.",
      "Expiry and refresh policies without claiming live data.",
    ],
  },
  {
    code: "TRU",
    icon: "shield",
    title: ["حالة بيانات صادقة", "Truthful data state"],
    description: [
      "متصل أو متأخر أو غير متاح مع سبب واضح.",
      "Connected, stale, or unavailable with an explicit reason.",
    ],
  },
];

const sourceGroups: ReadonlyArray<{
  icon: IconName;
  title: Pair;
  scope: Pair;
}> = [
  {
    icon: "trend",
    title: ["بيانات الأسواق", "Market data"],
    scope: ["أسهم · معادن · عملات رقمية", "Equities · metals · digital assets"],
  },
  {
    icon: "people",
    title: ["بيانات المنصة", "Platform data"],
    scope: ["المستخدمون · المشاريع · الفرق", "Users · projects · teams"],
  },
  {
    icon: "activity",
    title: ["المراقبة والصحة", "Observability & health"],
    scope: ["السجلات · التنبيهات · التتبّع", "Logs · alerts · traces"],
  },
];

const text = (locale: Locale, pair: Pair) => pair[locale === "ar" ? 0 : 1];

export function AdminDataCenter({
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
      activeRoute="/admin/data-center"
      userLabel={userLabel}
      admin
    >
      <section className="data-center-hero glass">
        <div className="data-center-hero__copy">
          <span className="eyebrow">JENAN DATA FABRIC</span>
          <h1>{ar ? "مركز البيانات الموثوقة" : "Trusted Data Center"}</h1>
          <p>
            {ar
              ? "واجهة إدارة موحّدة لمسار البيانات من المصدر إلى العرض. لا توجد اتصالات أو مؤشرات تشغيلية مفعّلة حاليًا."
              : "A unified control surface for the data path from source to presentation. No connections or operational metrics are active yet."}
          </p>
          <div className="data-center-hero__badges">
            <span>
              <i />
              {ar ? "الحالة: غير مهيأ" : "State: unconfigured"}
            </span>
            <span>
              <Icon name="shield" />
              {ar ? "لا بيانات تجريبية" : "No sample data"}
            </span>
          </div>
        </div>
        <div
          className="data-fabric"
          aria-label={ar ? "مسار البيانات المخطط" : "Planned data path"}
        >
          {layers.map((layer, index) => (
            <div className="data-fabric__node" key={layer.code}>
              <span>
                <Icon name={layer.icon} />
              </span>
              <small>{layer.code}</small>
              {index < layers.length - 1 ? <i aria-hidden="true" /> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="data-center-kpis">
        {[
          [
            ar ? "المصادر المتصلة" : "Connected sources",
            "00",
            ar ? "لا اتصال" : "No connection",
          ],
          [
            ar ? "المحولات المهيأة" : "Configured adapters",
            "00",
            ar ? "بانتظار الإعداد" : "Awaiting setup",
          ],
          [
            ar ? "سياسات التخزين" : "Cache policies",
            "00",
            ar ? "غير محددة" : "Not defined",
          ],
          [
            ar ? "تنبيهات الجودة" : "Quality alerts",
            "—",
            ar ? "لا مصدر قياس" : "No measurement source",
          ],
        ].map(([label, value, note]) => (
          <article className="card data-center-kpi" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>

      <section className="data-center-heading">
        <div>
          <span className="eyebrow">DATA TRUST PIPELINE</span>
          <h2>
            {ar
              ? "مسار الحقيقة من المصدر إلى الواجهة"
              : "Source-to-interface truth pipeline"}
          </h2>
          <p>
            {ar
              ? "كل طبقة مستقلة بعقد واضح، وحالتها لا تتحول إلى متصل إلا بدليل فعلي."
              : "Each layer has an explicit contract and never reports connected without evidence."}
          </p>
        </div>
        <span className="badge warn">
          {ar ? "تصميم غير تشغيلي" : "Non-operational design"}
        </span>
      </section>

      <section className="data-pipeline">
        {layers.map((layer, index) => (
          <article className="card data-layer" key={layer.code}>
            <header>
              <span>
                <Icon name={layer.icon} />
              </span>
              <small>
                0{index + 1} / {layer.code}
              </small>
            </header>
            <h3>{text(locale, layer.title)}</h3>
            <p>{text(locale, layer.description)}</p>
            <div>
              <i />
              {ar ? "غير مهيأ" : "Unconfigured"}
            </div>
          </article>
        ))}
      </section>

      <section className="data-center-grid">
        <article className="card source-registry">
          <header>
            <div>
              <span className="eyebrow">SOURCE REGISTRY</span>
              <h2>{ar ? "سجل مصادر البيانات" : "Data source registry"}</h2>
            </div>
            <span className="badge">{ar ? "0 مصادر" : "0 sources"}</span>
          </header>
          <div className="source-registry__list">
            {sourceGroups.map((source) => (
              <div key={source.title[1]}>
                <span>
                  <Icon name={source.icon} />
                </span>
                <div>
                  <strong>{text(locale, source.title)}</strong>
                  <small>{text(locale, source.scope)}</small>
                </div>
                <b>{ar ? "غير مربوط" : "Not connected"}</b>
              </div>
            ))}
          </div>
          <button type="button" className="button button--primary" disabled>
            {ar ? "إضافة مصدر — غير متاح" : "Add source — unavailable"}
          </button>
        </article>

        <aside className="card data-trust-state">
          <header>
            <Icon name="shield" />
            <div>
              <span className="eyebrow">TRUTHFUL STATE</span>
              <h2>{ar ? "عقد حالة البيانات" : "Data state contract"}</h2>
            </div>
          </header>
          <div className="data-trust-state__states">
            {[
              [
                ar ? "متصل" : "Connected",
                ar ? "دليل اتصال صالح" : "Valid connection evidence",
                "ready",
              ],
              [
                ar ? "متأخر" : "Stale",
                ar ? "آخر تحديث معروف" : "Known last update",
                "stale",
              ],
              [
                ar ? "غير متاح" : "Unavailable",
                ar ? "سبب واضح للمستخدم" : "Explicit user-facing reason",
                "off",
              ],
            ].map(([label, note, state]) => (
              <span key={state} data-state={state}>
                <i />
                <strong>{label}</strong>
                <small>{note}</small>
              </span>
            ))}
          </div>
          <p>
            {ar
              ? "الحالة الحالية لجميع المصادر: غير متاح — لم يتم ربط أي مزوّد."
              : "Current state for all sources: unavailable — no provider is connected."}
          </p>
        </aside>
      </section>

      <section className="card data-audit">
        <header>
          <div>
            <span className="eyebrow">AUDIT & LINEAGE</span>
            <h2>{ar ? "التدقيق ونَسب البيانات" : "Audit and data lineage"}</h2>
          </div>
          <span className="badge">{ar ? "سجل فارغ" : "Empty log"}</span>
        </header>
        <div>
          <Icon name="activity" />
          <strong>{ar ? "لا توجد أحداث بيانات" : "No data events"}</strong>
          <p>
            {ar
              ? "ستظهر هنا هوية المصدر ووقت الجلب والتحويل وسياسة التخزين عند تشغيل تكامل معتمد."
              : "Source identity, fetch time, transformation, and cache policy appear here once an approved integration is active."}
          </p>
        </div>
      </section>
    </PlatformShell>
  );
}
