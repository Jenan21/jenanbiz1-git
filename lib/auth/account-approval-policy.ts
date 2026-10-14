/**
 * Whether a new account must wait for the owner's approval before it can sign in. It is on by default for a public
 * production site, so opening registration to everyone never gives anyone access by itself; the owner can still
 * decide explicitly with `REQUIRE_ACCOUNT_APPROVAL=true|false`.
 */
export function accountApprovalRequired(env: Record<string, string | undefined> = process.env) {
  const setting = env.REQUIRE_ACCOUNT_APPROVAL?.trim().toLowerCase();
  if (setting === "true") return true;
  if (setting === "false") return false;
  return env.NODE_ENV === "production" && env.PUBLIC_LAUNCH?.trim() === "approved";
}
