import { notFound } from "next/navigation";
import { AcademyReferenceWorkspace } from "@/components/academy/academy-reference-workspace";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findAcademyFlow } from "@/lib/academy/user-academy-routes";

export default async function AcademyFlowPage({ params }: { params: Promise<{ flow: string[] }> }) {
  const { flow } = await params;
  const route = `/academy/${flow.join("/")}`;
  const definition = findAcademyFlow(route);
  if (!definition || route === "/academy/courses") notFound();
  const [{ locale }, user, course] = await Promise.all([
    getRequestDictionary(),
    requireUser(route),
    definition.source === "course" ? db.academyCourse.findFirst({ include: { lessons: { orderBy: { sequence: "asc" } }, labs: { orderBy: { sequence: "asc" } }, exams: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } }) : Promise.resolve(null),
  ]);
  return <PlatformShell locale={locale} activeRoute="/academy" userLabel={user.profile?.displayName ?? user.email}><AcademyReferenceWorkspace course={course} definition={definition} locale={locale} /></PlatformShell>;
}