import { ProjectsReportPreview } from "@/components/source/projects-report-preview";
import { getRequestDictionary } from "@/lib/i18n/server";
export default async function ProjectsReportReviewPage() {
  const { locale } = await getRequestDictionary();
  return <ProjectsReportPreview locale={locale} userLabel="Jenan BIZ Review" variant="executive" />;
}
