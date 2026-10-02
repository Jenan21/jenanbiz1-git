import { ProjectsHub } from "@/components/projects/projects-hub";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/projects")]);
  const projects = await db.project.findMany({
    where: {
      OR: [
        { createdById: user.id },
        { members: { some: { userId: user.id } } },
      ],
    },
    select: {
      id: true,
      name: true,
      status: true,
      currentPhase: true,
      sector: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return (
    <ProjectsHub
      locale={locale}
      projects={projects}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
