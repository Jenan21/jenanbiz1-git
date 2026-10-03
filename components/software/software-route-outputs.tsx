"use client";

import { Icon } from "@/components/ui/icons";
import type { SoftwareWorkspaceData } from "@/components/software/software-erp-types";
import { buildSoftwareRouteExport, serializeSoftwareCsv } from "@/lib/software/route-export";
import type { SoftwareRouteId } from "@/lib/software/software-routes";
import type { Locale } from "@/types/i18n";

export function SoftwareRouteOutputs({ locale, routeId, workspace }: { locale: Locale; routeId: SoftwareRouteId; workspace: SoftwareWorkspaceData }) {
  const ar = locale === "ar";
  const output = buildSoftwareRouteExport(routeId, workspace, locale);
  if (!output) return null;

  function downloadCsv() {
    const url = URL.createObjectURL(new Blob([serializeSoftwareCsv(output!)], { type: "text/csv;charset=utf-8" }));
    const download = document.createElement("a");
    download.href = url;
    download.download = output!.filename;
    download.click();
    URL.revokeObjectURL(url);
  }

  return <section className="software-route-outputs" aria-label={ar ? "مخرجات السجلات" : "Record outputs"} data-software-export={output.filename}>
    <div><Icon name="briefcase" /><p><strong>{ar ? "مخرجات السجلات" : "Record outputs"}</strong><span>{output.rows.length} {ar ? "سجل · المصدر: بيانات المسار الحالية" : "records · Source: current route data"}</span></p></div>
    <div><button disabled={!output.rows.length} onClick={downloadCsv} type="button">CSV</button><button onClick={() => window.print()} type="button">{ar ? "طباعة / PDF" : "Print / PDF"}</button></div>
  </section>;
}