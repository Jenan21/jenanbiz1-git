import Image from "next/image";
import Link from "next/link";
import { JenanHeader } from "@/components/shell/jenan-header";
import { Icon, type IconName } from "@/components/ui/icons";
import { profileText, type PlatformProfile } from "@/lib/platform/platform-profile";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];

const NOT_PROVIDED: Copy = ["لم يُضف بعد", "Not provided yet"];

function pick(value: Copy, locale: Locale) {
  return locale === "ar" ? value[0] : value[1];
}

function Value({ children, locale }: { children: string; locale: Locale }) {
  return children ? <>{children}</> : <em className="about__empty">{pick(NOT_PROVIDED, locale)}</em>;
}

function Panel({ children, icon, title }: { children: React.ReactNode; icon: IconName; title: string }) {
  return (
    <section className="about-panel">
      <h2><span aria-hidden="true" className="showcase__mark"><Icon name={icon} /></span>{title}</h2>
      {children}
    </section>
  );
}

/**
 * "About us": what the platform says about itself, exactly as an administrator entered it. Nothing here is filled in by
 * the system; a missing field says it was not provided. The logo sits behind the page as a watermark.
 */
export function AboutPage({
  canEdit,
  locale,
  profile,
  unavailable,
  updatedAt,
  userLabel,
}: {
  canEdit: boolean;
  locale: Locale;
  profile: PlatformProfile;
  unavailable: boolean;
  updatedAt: Date | null;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const { contacts, registration } = profile;
  const name = profileText(profile.name, locale) || "Jenan PRO";
  const summary = profileText(profile.summary, locale);
  const address = profileText(contacts.address, locale);
  const hours = profileText(contacts.hours, locale);
  const whatsappDigits = contacts.whatsapp.replace(/\D/g, "");
  const registrationRows: ReadonlyArray<{ label: Copy; value: string }> = [
    { label: ["السجل التجاري", "Commercial register"], value: registration.commercialRegister },
    { label: ["الرقم الضريبي", "VAT number"], value: registration.vatNumber },
    { label: ["رقم الترخيص", "Licence number"], value: registration.licenseNumber },
    { label: ["سنة التأسيس", "Established"], value: registration.establishedYear },
  ];
  const nothingYet = !summary && !profile.achievements.length && !contacts.phones.length && !contacts.emails.length && !registrationRows.some((row) => row.value);

  return (
    <main
      className="about"
      data-about-route="/benefits"
      data-about-source={updatedAt ? "ADMIN_ENTERED_PROFILE" : "NOT_PROVIDED"}
      dir={ar ? "rtl" : "ltr"}
    >
      <JenanHeader locale={locale} userLabel={userLabel} />
      <div aria-hidden="true" className="about__watermark">
        <Image alt="" height={392} src="/assets/jenan-pro-mark-large.webp" width={512} />
      </div>

      <div className="about__body">
        <header className="about__hero">
          <span className="showcase__tag"><Icon name="building" />{ar ? "من نحن" : "About us"}</span>
          <h1>{name}</h1>
          <p>{summary || (nothingYet ? (ar ? "لم تُضف إدارة المنصة تعريفها بعد." : "The platform team has not added its profile yet.") : "")}</p>
          {canEdit ? <Link className="about__edit" href="/admin/platform-profile"><Icon name="settings" />{ar ? "تعديل هذه الصفحة" : "Edit this page"}</Link> : null}
        </header>

        {unavailable ? <p className="about__notice" role="alert"><Icon name="lock" />{ar ? "تعذر تحميل معلومات المنصة الآن. حاول لاحقًا." : "The platform information could not be loaded right now. Please try again later."}</p> : null}

        <div className="about__pillars">
          <Panel icon="eye" title={ar ? "رؤيتنا" : "Our vision"}>
            <p><Value locale={locale}>{profileText(profile.vision, locale)}</Value></p>
          </Panel>
          <Panel icon="rocket" title={ar ? "رسالتنا" : "Our mission"}>
            <p><Value locale={locale}>{profileText(profile.mission, locale)}</Value></p>
          </Panel>
        </div>

        <div className="about__grid">
          <Panel icon="trend" title={ar ? "إنجازاتنا" : "Our achievements"}>
            {profile.achievements.length ? (
              <ul className="about__achievements">
                {profile.achievements.map((item, index) => (
                  <li key={index}>
                    {item.value ? <strong>{item.value}</strong> : null}
                    <b>{profileText(item.title, locale)}</b>
                    <small>{profileText(item.description, locale)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p><em className="about__empty">{pick(NOT_PROVIDED, locale)}</em></p>
            )}
          </Panel>

          <Panel icon="shield" title={ar ? "السجلات والتراخيص" : "Registration and licences"}>
            <dl className="about__rows">
              {registrationRows.map((row) => (
                <div key={row.label[1]}>
                  <dt>{pick(row.label, locale)}</dt>
                  <dd dir="ltr"><Value locale={locale}>{row.value}</Value></dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel icon="phone" title={ar ? "تواصل معنا" : "Contact us"}>
            <dl className="about__rows">
              <div>
                <dt>{ar ? "الهاتف" : "Phone"}</dt>
                <dd dir="ltr">
                  {contacts.phones.length ? contacts.phones.map((phone) => <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} key={phone}>{phone}</a>) : <em className="about__empty">{pick(NOT_PROVIDED, locale)}</em>}
                </dd>
              </div>
              <div>
                <dt>{ar ? "البريد" : "Email"}</dt>
                <dd dir="ltr">
                  {contacts.emails.length ? contacts.emails.map((email) => <a href={`mailto:${email}`} key={email}>{email}</a>) : <em className="about__empty">{pick(NOT_PROVIDED, locale)}</em>}
                </dd>
              </div>
              <div>
                <dt>{ar ? "واتساب" : "WhatsApp"}</dt>
                <dd dir="ltr">{contacts.whatsapp ? <a href={`https://wa.me/${whatsappDigits}`} rel="noreferrer" target="_blank">{contacts.whatsapp}</a> : <em className="about__empty">{pick(NOT_PROVIDED, locale)}</em>}</dd>
              </div>
              <div>
                <dt>{ar ? "الموقع" : "Website"}</dt>
                <dd dir="ltr">{contacts.website ? <a href={contacts.website} rel="noreferrer" target="_blank">{contacts.website.replace(/^https:\/\//, "")}</a> : <em className="about__empty">{pick(NOT_PROVIDED, locale)}</em>}</dd>
              </div>
              <div>
                <dt>{ar ? "العنوان" : "Address"}</dt>
                <dd><Value locale={locale}>{address}</Value></dd>
              </div>
              <div>
                <dt>{ar ? "ساعات العمل" : "Working hours"}</dt>
                <dd><Value locale={locale}>{hours}</Value></dd>
              </div>
            </dl>
          </Panel>
        </div>

        <footer className="about__foot">
          {updatedAt ? (ar ? `آخر تحديث: ${new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(updatedAt)}` : `Last updated: ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(updatedAt)}`) : ""}
        </footer>
      </div>
    </main>
  );
}
