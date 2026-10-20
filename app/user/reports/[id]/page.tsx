import { notFound } from "next/navigation";
import { AnalysisReportView } from "@/components/projects/analysis-report-view";
import { JenanHeader } from "@/components/shell/jenan-header";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { buildReport, reportDate } from "@/lib/projects/analysis-report";
import { getSavedAnalysisReport } from "@/services/projects/analysis-report-service";

const REPORT_ID = /^[a-z0-9]{20,40}$/i;

/** A report copy the person saved in «بياناتي»: the project facts, location and figures exactly as they were saved. */
export default async function SavedReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/user/reports")]);
  if (!REPORT_ID.test(id)) notFound();
  const saved = await getSavedAnalysisReport(id, user.id).catch(() => null);
  if (!saved) notFound();
  const model = buildReport(saved.data, locale);

  return (
    <main className="pa-entry rp-page" data-testid="saved-analysis-report" dir={locale === "ar" ? "rtl" : "ltr"}>
      <JenanHeader locale={locale} userLabel={user.profile?.displayName ?? user.email} />
      <AnalysisReportView
        actions={{
          newHref: "/projects/analysis",
          pdfHref: `/api/user/reports/${saved.id}/pdf?locale=${locale}`,
          savedAtLabel: reportDate(saved.savedAt, locale),
          sharePath: `/projects/analysis/report?project=${saved.data.project.id}`,
        }}
        model={model}
        testId="analysis-saved-report"
      />
    </main>
  );
}
