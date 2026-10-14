/** Which pages get the floating "back / home" shortcuts, and where they lead. Pure, so it can be tested without a browser. */

const PUBLIC_ROUTES = new Set(["/", "/auth", "/login", "/register"]);

/** The pre-entry page and the sign-in and registration flow are frozen designs: nothing is added to them. */
export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.has(pathname) || pathname.startsWith("/auth/");
}

/** The signed-in home already carries the full navigation, so it gets no shortcuts. */
export function showsShortcuts(pathname: string) {
  return !isPublicRoute(pathname) && pathname !== "/dashboard";
}

/** The administration area has its own navigation, and the home header already links to it. */
export function showsAdminEntry(pathname: string, admin: boolean) {
  return admin && showsShortcuts(pathname) && pathname !== "/admin" && !pathname.startsWith("/admin/");
}

/** `signedIn` is null until the session answered; a signed-out visitor goes to the public home instead. */
export function homePath(signedIn: boolean | null) {
  return signedIn === false ? "/" : "/dashboard";
}

/**
 * Where "back" goes when the visitor arrived directly on this page and there is no earlier page of the platform to
 * return to: the section it belongs to, or the home when it is already the section's first page. Only the first
 * segment is used, because it is the one level that is always a real page.
 */
export function backFallback(pathname: string, signedIn: boolean | null) {
  const clean = pathname.replace(/\/+$/, "");
  const section = clean.split("/").filter(Boolean)[0];
  return section && clean !== `/${section}` ? `/${section}` : homePath(signedIn);
}
