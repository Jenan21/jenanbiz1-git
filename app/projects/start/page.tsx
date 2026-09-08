import { ProjectsLiveServicePage } from "@/components/source/projects-live-service-page";

export default function ProjectStartPage() {
  return (
    <ProjectsLiveServicePage
      title={["بدء المشروع", "Start project"]}
      description={["لا يبدأ المشروع إلا بعد اكتمال الأدلة واعتماد قرار التقييم.", "A project starts only after evidence is complete and the evaluation decision is approved."]}
    />
  );
}
