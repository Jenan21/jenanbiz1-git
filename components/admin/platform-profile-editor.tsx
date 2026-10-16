"use client";

import { useEffect, useState } from "react";
import { emptyPlatformProfile } from "@/lib/platform/platform-profile-empty";
import type { PlatformProfile } from "@/lib/platform/platform-profile";

type Bilingual = { ar: string; en: string };
type Status = { kind: "idle" } | { kind: "loading" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string };

const MAX_ROWS = { achievements: 8, emails: 6, phones: 6 } as const;

function BilingualField({ label, max, multiline = false, onChange, value }: { label: string; max: number; multiline?: boolean; onChange: (next: Bilingual) => void; value: Bilingual }) {
  const Input = multiline ? "textarea" : "input";
  return (
    <fieldset className="profile-editor__pair">
      <legend>{label}</legend>
      <label>
        <span>العربية</span>
        <Input dir="rtl" maxLength={max} onChange={(event) => onChange({ ...value, ar: event.target.value })} rows={multiline ? 3 : undefined} value={value.ar} />
      </label>
      <label>
        <span>English</span>
        <Input dir="ltr" maxLength={max} onChange={(event) => onChange({ ...value, en: event.target.value })} rows={multiline ? 3 : undefined} value={value.en} />
      </label>
    </fieldset>
  );
}

function TextField({ dir = "ltr", label, max, onChange, placeholder, value }: { dir?: "ltr" | "rtl"; label: string; max: number; onChange: (next: string) => void; placeholder?: string; value: string }) {
  return (
    <label className="profile-editor__field">
      <span>{label}</span>
      <input dir={dir} maxLength={max} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
    </label>
  );
}

function ListField({ addLabel, label, max, onChange, placeholder, type, values }: { addLabel: string; label: string; max: number; onChange: (next: string[]) => void; placeholder: string; type: "email" | "tel"; values: string[] }) {
  return (
    <div className="profile-editor__list">
      <span className="profile-editor__list-title">{label}</span>
      {values.map((value, index) => (
        <div className="profile-editor__row" key={index}>
          <input
            aria-label={`${label} ${index + 1}`}
            dir="ltr"
            inputMode={type === "tel" ? "tel" : "email"}
            maxLength={160}
            onChange={(event) => onChange(values.map((item, position) => (position === index ? event.target.value : item)))}
            placeholder={placeholder}
            type={type === "tel" ? "text" : "email"}
            value={value}
          />
          <button aria-label="حذف" onClick={() => onChange(values.filter((_, position) => position !== index))} type="button">×</button>
        </div>
      ))}
      {values.length < max ? <button className="profile-editor__add" onClick={() => onChange([...values, ""])} type="button">+ {addLabel}</button> : null}
    </div>
  );
}

/** The administrator's form for the "About us" page. It saves exactly what is typed; blank fields stay blank. */
export function PlatformProfileEditor() {
  const [profile, setProfile] = useState<PlatformProfile>(emptyPlatformProfile);
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/platform-profile", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { message?: string; profile?: PlatformProfile } | null;
        if (!response.ok || !payload?.profile) throw new Error(payload?.message ?? "تعذر تحميل البيانات");
        setProfile(payload.profile);
        setStatus({ kind: "idle" });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setStatus({ kind: "error", message: error instanceof Error ? error.message : "تعذر تحميل البيانات" });
      });
    return () => controller.abort();
  }, []);

  function patch(next: Partial<PlatformProfile>) {
    setProfile((current) => ({ ...current, ...next }));
    if (status.kind === "saved") setStatus({ kind: "idle" });
  }

  async function save() {
    setStatus({ kind: "saving" });
    const response = await fetch("/api/admin/platform-profile", {
      body: JSON.stringify(profile),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { fields?: string[]; message?: string; profile?: PlatformProfile } | null;
    if (!response || !response.ok || !payload?.profile) {
      const fields = payload?.fields?.length ? ` (${payload.fields.join("، ")})` : "";
      setStatus({ kind: "error", message: `${payload?.message ?? "تعذر الحفظ"}${fields}` });
      return;
    }
    setProfile(payload.profile);
    setStatus({ kind: "saved", at: new Date().toLocaleTimeString("ar-SA") });
  }

  const busy = status.kind === "loading" || status.kind === "saving";
  const { contacts, registration } = profile;

  return (
    <main className="profile-editor" dir="rtl">
      <header className="profile-editor__head">
        <div>
          <span className="profile-editor__kicker">إعدادات المنصة</span>
          <h1>صفحة «من نحن»</h1>
          <p>ما تكتبه هنا يظهر لكل الأعضاء في صفحة «من نحن» كما هو. الحقول الفارغة تظهر هناك «لم يُضف بعد» ولا نضيف عنك أي معلومة.</p>
        </div>
        <a className="profile-editor__view" href="/benefits" rel="noreferrer" target="_blank">عرض الصفحة</a>
      </header>

      <section className="profile-editor__card">
        <h2>التعريف بالمنصة</h2>
        <BilingualField label="اسم المنصة أو الشركة" max={120} onChange={(name) => patch({ name })} value={profile.name} />
        <BilingualField label="نبذة تعريفية" max={1200} multiline onChange={(summary) => patch({ summary })} value={profile.summary} />
        <BilingualField label="الرؤية" max={600} multiline onChange={(vision) => patch({ vision })} value={profile.vision} />
        <BilingualField label="الرسالة" max={600} multiline onChange={(mission) => patch({ mission })} value={profile.mission} />
      </section>

      <section className="profile-editor__card">
        <h2>السجلات والتراخيص</h2>
        <div className="profile-editor__grid">
          <TextField label="رقم السجل التجاري" max={60} onChange={(commercialRegister) => patch({ registration: { ...registration, commercialRegister } })} value={registration.commercialRegister} />
          <TextField label="الرقم الضريبي" max={60} onChange={(vatNumber) => patch({ registration: { ...registration, vatNumber } })} value={registration.vatNumber} />
          <TextField label="رقم الترخيص" max={60} onChange={(licenseNumber) => patch({ registration: { ...registration, licenseNumber } })} value={registration.licenseNumber} />
          <TextField label="سنة التأسيس" max={4} onChange={(establishedYear) => patch({ registration: { ...registration, establishedYear } })} placeholder="2024" value={registration.establishedYear} />
        </div>
      </section>

      <section className="profile-editor__card">
        <h2>التواصل</h2>
        <div className="profile-editor__grid">
          <ListField addLabel="إضافة رقم" label="أرقام الهاتف" max={MAX_ROWS.phones} onChange={(phones) => patch({ contacts: { ...contacts, phones } })} placeholder="+966 5X XXX XXXX" type="tel" values={contacts.phones} />
          <ListField addLabel="إضافة بريد" label="البريد الإلكتروني" max={MAX_ROWS.emails} onChange={(emails) => patch({ contacts: { ...contacts, emails } })} placeholder="name@domain.com" type="email" values={contacts.emails} />
          <TextField label="واتساب" max={40} onChange={(whatsapp) => patch({ contacts: { ...contacts, whatsapp } })} placeholder="+966 5X XXX XXXX" value={contacts.whatsapp} />
          <TextField label="الموقع الإلكتروني (https)" max={300} onChange={(website) => patch({ contacts: { ...contacts, website } })} placeholder="https://jenanpro.sa" value={contacts.website} />
        </div>
        <BilingualField label="العنوان" max={300} onChange={(address) => patch({ contacts: { ...contacts, address } })} value={contacts.address} />
        <BilingualField label="ساعات العمل" max={160} onChange={(hours) => patch({ contacts: { ...contacts, hours } })} value={contacts.hours} />
      </section>

      <section className="profile-editor__card">
        <h2>الإنجازات</h2>
        <p className="profile-editor__hint">أدخل فقط ما هو حقيقي وموثق لديكم. القيمة قصيرة مثل «+120» أو «2024».</p>
        {profile.achievements.map((item, index) => (
          <div className="profile-editor__achievement" key={index}>
            <TextField dir="ltr" label={`القيمة ${index + 1}`} max={24} onChange={(value) => patch({ achievements: profile.achievements.map((entry, position) => (position === index ? { ...entry, value } : entry)) })} value={item.value} />
            <BilingualField label="العنوان" max={100} onChange={(title) => patch({ achievements: profile.achievements.map((entry, position) => (position === index ? { ...entry, title } : entry)) })} value={item.title} />
            <BilingualField label="الوصف" max={240} onChange={(description) => patch({ achievements: profile.achievements.map((entry, position) => (position === index ? { ...entry, description } : entry)) })} value={item.description} />
            <button className="profile-editor__remove" onClick={() => patch({ achievements: profile.achievements.filter((_, position) => position !== index) })} type="button">حذف الإنجاز</button>
          </div>
        ))}
        {profile.achievements.length < MAX_ROWS.achievements ? (
          <button className="profile-editor__add" onClick={() => patch({ achievements: [...profile.achievements, { description: { ar: "", en: "" }, title: { ar: "", en: "" }, value: "" }] })} type="button">+ إضافة إنجاز</button>
        ) : null}
      </section>

      <footer className="profile-editor__bar">
        <span aria-live="polite" role="status">
          {status.kind === "loading" ? "جارٍ التحميل..." : null}
          {status.kind === "saving" ? "جارٍ الحفظ..." : null}
          {status.kind === "saved" ? `تم الحفظ ${status.at}` : null}
          {status.kind === "error" ? <b className="is-error">{status.message}</b> : null}
        </span>
        <button className="profile-editor__save" disabled={busy} onClick={() => void save()} type="button">حفظ التغييرات</button>
      </footer>
    </main>
  );
}
