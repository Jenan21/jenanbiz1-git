import { renderAdminOperationRoute } from "@/components/admin/admin-operation-route";

export default async function Page({ params }: { params: Promise<{ flow?: string[] }> }) {
  const { flow = [] } = await params;
  return renderAdminOperationRoute(`/robot-org${flow.length ? `/${flow.join("/")}` : ""}`);
}