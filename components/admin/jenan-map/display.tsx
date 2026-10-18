import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function displayDate(value?: string | null) {
  if (!value) return "غير متاح";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير متاح";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
}

export function MapPanel({ title, children }: { title: string; children: ReactNode }) {
  return <Card className="jenan-map-admin__panel"><h2>{title}</h2>{children}</Card>;
}

export function MapEmpty({ children = "لا توجد بيانات مسجلة. لم تُحمّل مجموعة بيانات فعلية ولم يتحقق القبول التشغيلي." }: { children?: ReactNode }) {
  return <div className="jenan-map-admin__empty">{children}</div>;
}

export function MapTable({ headers, children }: { headers: readonly string[]; children: ReactNode }) {
  return <div className="jenan-map-admin__table-wrap" role="region" aria-label={headers.join("، ")}
    tabIndex={0} // NOSONAR a scrollable region has to take keyboard focus so a wide table can be scrolled without a mouse (WCAG 2.1.1)
  >
    <table><thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{children}</tbody></table>
  </div>;
}
