import { ReportPage } from "@/components/reports/report-page";

export default async function Page({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <ReportPage path="/reports/view/general" projectId={project} />;
}