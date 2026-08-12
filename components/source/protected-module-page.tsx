import { SystemRole } from "@/generated/prisma/client";
import { requireSystemRole, requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { ModuleScreen } from "@/components/source/module-screen";
import {
  BountyHuntersScreen,
  FundingEligibilityScreen,
  RoboticsCatalogScreen,
} from "@/components/source/specialized-screens";

export async function ProtectedModulePage({ route }: { route: string }) {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser(route),
  ]);
  return (
    <ModuleScreen
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
    <FundingEligibilityScreen
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
    <RoboticsCatalogScreen
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
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
