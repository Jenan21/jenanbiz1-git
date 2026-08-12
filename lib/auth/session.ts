import { cookies } from "next/headers";
import { redirect, forbidden } from "next/navigation";
import type { SystemRole } from "@/generated/prisma/client";
import { getSessionUser } from "@/services/auth/auth.service";

export const SESSION_COOKIE = "jenan_session";
export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getSessionUser(token) : null;
}

export async function requireUser(nextPath = "/dashboard") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export async function requireSystemRole(roles: SystemRole[]) {
  const user = await requireUser("/admin");
  if (!roles.includes(user.systemRole)) forbidden();
  return user;
}
