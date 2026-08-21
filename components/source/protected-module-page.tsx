import { SystemRole } from "@/generated/prisma/client";
import { requireSystemRole, requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { ModuleScreen } from "@/components/source/module-screen";
import { ModuleWorkspace } from "@/components/source/module-workspace";
import { AdminCommandCenter } from "@/components/source/admin-command-center";
import { BountyHuntersScreen } from "@/components/source/specialized-screens";
import {
  RefinedFundingScreen,
  RefinedRoboticsCatalog,
  RobotDetailScreen,
} from "@/components/source/refinement-screens";

export async function ProtectedModulePage({ route }: { route: string }) {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser(route),
  ]);
  return (
    <ModuleWorkspace
      locale={locale}
      route={route}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}

export async function ProtectedAdminPage({ route }: { route: string }) {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireSystemRole([SystemRole.ADMIN, SystemRole.SUPER_ADMIN]),
  ]);
  if (route === "/admin") {
    return (
      <AdminCommandCenter
        locale={locale}
        userLabel={user.profile?.displayName ?? user.email}
      />
    );
  }
  return (
    <ModuleScreen
      locale={locale}
      route={route}
      userLabel={user.profile?.displayName ?? user.email}
      admin
    />
  );
}

export async function ProtectedFundingPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/funding-eligibility"),
  ]);
  return (
    <RefinedFundingScreen
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}

export async function ProtectedRoboticsPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/software/robotics"),
  ]);
  return (
    <RefinedRoboticsCatalog
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}

export async function ProtectedRobotDetailPage({ slug }: { slug: string }) {
  const route = `/software/robotics/${slug}`;
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser(route),
  ]);
  return (
    <RobotDetailScreen
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
      slug={slug}
    />
  );
}

export async function ProtectedBountyHuntersPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireSystemRole([SystemRole.ADMIN, SystemRole.SUPER_ADMIN]),
  ]);
  return (
    <BountyHuntersScreen
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
