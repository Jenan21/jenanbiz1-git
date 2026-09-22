import { ProjectsLiveServicePage } from "@/components/projects/projects-live-service-page";

export default function ProjectEvaluationPage() {
  return (
    <ProjectsLiveServicePage
      title={["تقييم المشروع", "Project evaluation"]}
      description={["قرار تقييم موزون لا يعتمد إلا على الأدلة المكتملة ومصادرها.", "A weighted evaluation decision based only on complete evidence and its sources."]}
    />
  );
}
