import { ProjectsLiveServicePage } from "@/components/projects/projects-live-service-page";

export default function ProjectAnalysisPage() {
  return (
    <ProjectsLiveServicePage
      title={["تحليل المشروع", "Project analysis"]}
      description={["تحليل موثق يعتمد على بيانات المشروع والأدلة المحفوظة.", "Evidence-backed analysis using the project data and saved assessments."]}
    />
  );
}
