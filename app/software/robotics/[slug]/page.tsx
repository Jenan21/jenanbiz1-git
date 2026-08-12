import { ProtectedRobotDetailPage } from "@/components/source/protected-module-page";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProtectedRobotDetailPage slug={slug} />;
}
