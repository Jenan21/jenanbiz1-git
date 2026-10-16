"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

type Copy = readonly [string, string];
type Row = { badge?: string; href?: string; id: string; meta?: string; title: string; value?: string };
type Json = Record<string, unknown>;

export type LiveSource =
  | "academy-courses"
  | "academy-overview"
  | "market-listings"
  | "marketing-campaigns"
  | "software-documents"
  | "talent-jobs";

const KIND_ROUTES: Record<string, string> = {
  CV: "/software/design/cv",
  DOCS: "/software/design/docs",
  LETTERHEAD: "/software/design/letterhead",
  LOGO: "/software/design/logo",
  PRESENTATION: "/software/design/presentations",
  SHEETS: "/software/design/sheets",
};

const KIND_LABELS: Record<string, Copy> = {
  CV: ["سيرة ذاتية", "CV"],
  DOCS: ["مستند", "Document"],
  LETTERHEAD: ["ورق رسمي", "Letterhead"],
  LOGO: ["شعار", "Logo"],
  PRESENTATION: ["عرض تقديمي", "Presentation"],
  SHEETS: ["جدول", "Sheet"],
};

const CAMPAIGN_STATUS: Record<string, Copy> = {
  ACTIVE: ["نشطة", "Active"],
  ARCHIVED: ["مؤرشفة", "Archived"],
  DRAFT: ["مسودة", "Draft"],
  PAUSED: ["متوقفة", "Paused"],
};

const WORK_MODE: Record<string, Copy> = {
  HYBRID: ["هجين", "Hybrid"],
  ONSITE: ["حضوري", "On-site"],
  ON_SITE: ["حضوري", "On-site"],
  REMOTE: ["عن بعد", "Remote"],
};

const str = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);
const obj = (value: unknown): Json => (value && typeof value === "object" ? (value as Json) : {});

function money(minor: unknown, currency: unknown, locale: string) {
  if (typeof minor !== "number") return undefined;
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { currency: str(currency) || "SAR", maximumFractionDigits: 0, style: "currency" }).format(minor / 100);
  } catch {
    return undefined;
  }
}

const SOURCES: Record<LiveSource, { rows: (json: Json, ar: boolean) => Row[]; url: string }> = {
  "academy-courses": {
    url: "/api/academy/catalog",
    rows: (json, ar) =>
      list(json.courses).slice(0, 4).map((course) => ({
        href: `/academy/courses/${str(course.id)}`,
        id: str(course.id),
        meta: str(obj(course.field).name) || undefined,
        title: str(course.title),
        value: `${Number(obj(course._count).lessons ?? 0)} ${ar ? "دروس" : "lessons"}`,
      })),
  },
  "academy-overview": {
    url: "/api/academy/catalog",
    rows: (json, ar) => {
      const overview = obj(json.overview);
      return [
        { id: "courses", title: ar ? "دورات متاحة" : "Available courses", value: String(list(json.courses).length) },
        { id: "enrollments", title: ar ? "دوراتي المسجلة" : "My enrolments", value: String(Number(overview.enrollments ?? 0)) },
        { id: "completed", title: ar ? "دورات مكتملة" : "Completed", value: String(Number(overview.completedEnrollments ?? 0)) },
        { id: "certificates", title: ar ? "شهاداتي" : "My certificates", value: String(Number(overview.certificates ?? 0)) },
      ];
    },
  },
  "market-listings": {
    url: "/api/market?status=PUBLISHED&limit=4",
    rows: (json, ar) =>
      list(json.listings).slice(0, 4).map((listing) => ({
        badge: str(listing.kind) === "BUSINESS" ? (ar ? "نشاط" : "Business") : ar ? "مشروع" : "Project",
        href: "/market/listings",
        id: str(listing.id),
        meta: [str(listing.sector), str(listing.countryCode)].filter(Boolean).join(" · ") || undefined,
        title: str(listing.title),
        value: money(listing.askingPriceMinor, listing.currency, ar ? "ar" : "en"),
      })),
  },
  "marketing-campaigns": {
    url: "/api/marketing",
    rows: (json, ar) =>
      list(json.campaigns).slice(0, 4).map((campaign) => ({
        badge: (CAMPAIGN_STATUS[str(campaign.status)] ?? [str(campaign.status), str(campaign.status)])[ar ? 0 : 1],
        href: `/marketing/campaign/sample?campaign=${str(campaign.id)}`,
        id: str(campaign.id),
        meta: str(campaign.objective) || undefined,
        title: str(campaign.name),
      })),
  },
  "software-documents": {
    url: "/api/studio/documents",
    rows: (json, ar) =>
      list(json.documents).slice(0, 4).map((document) => {
        const kind = str(document.kind);
        const updated = str(document.updatedAt);
        return {
          badge: (KIND_LABELS[kind] ?? [kind, kind])[ar ? 0 : 1],
          href: KIND_ROUTES[kind],
          id: str(document.id),
          meta: updated ? new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "medium" }).format(new Date(updated)) : undefined,
          title: str(document.title),
        };
      }),
  },
  "talent-jobs": {
    url: "/api/talent?status=PUBLISHED&limit=4",
    rows: (json, ar) =>
      list(json.postings).filter((posting) => str(posting.status) === "PUBLISHED").slice(0, 4).map((posting) => ({
        badge: (WORK_MODE[str(posting.workMode)] ?? [str(posting.workMode), str(posting.workMode)])[ar ? 0 : 1] || undefined,
        href: `/talent/jobs/${str(posting.id)}`,
        id: str(posting.id),
        meta: [str(obj(posting.organization).name), str(posting.city), str(posting.countryCode)].filter(Boolean).join(" · ") || undefined,
        title: str(posting.title),
      })),
  },
};

/** A panel of the account's own records. It says so plainly when there are none or when they cannot be read. */
export function LivePanel({ emptyText, locale, source }: { emptyText: Copy; locale: "ar" | "en"; source: LiveSource }) {
  const ar = locale === "ar";
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ready"; rows: Row[] }>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const definition = SOURCES[source];
    fetch(definition.url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return (await response.json()) as Json;
      })
      .then((json) => setState({ kind: "ready", rows: definition.rows(json, ar).filter((row) => row.title) }))
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setState({ kind: "error" });
      });
    return () => controller.abort();
  }, [source, ar]);

  if (state.kind === "loading") return <p className="showcase-panel__note" role="status">{ar ? "جارٍ التحميل..." : "Loading..."}</p>;
  if (state.kind === "error") return <p className="showcase-panel__note"><Icon name="lock" />{ar ? "تعذر تحميل البيانات الآن." : "These records could not be loaded right now."}</p>;
  if (!state.rows.length) return <p className="showcase-panel__note"><Icon name="grid" />{emptyText[ar ? 0 : 1]}</p>;

  return (
    <ul className="showcase-panel__rows">
      {state.rows.map((row) => {
        const body = (
          <>
            <span>
              <strong>{row.title}</strong>
              {row.meta ? <small>{row.meta}</small> : null}
            </span>
            {row.badge ? <em>{row.badge}</em> : null}
            {row.value ? <b>{row.value}</b> : null}
          </>
        );
        return <li key={row.id}>{row.href ? <Link href={row.href}>{body}</Link> : <div>{body}</div>}</li>;
      })}
    </ul>
  );
}
