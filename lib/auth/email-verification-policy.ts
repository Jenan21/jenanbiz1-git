import { db, type DbExecutor } from "@/lib/db";

/**
 * Whether sensitive actions need a verified e-mail address. It is on by default once the platform is public, because
 * that is when anyone can register with an address that is not theirs; before that the owner decides with
 * `REQUIRE_EMAIL_VERIFICATION=true|false`.
 */
export function emailVerificationRequired(env: Record<string, string | undefined> = process.env) {
  const setting = env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase();
  if (setting === "true") return true;
  if (setting === "false") return false;
  return env.PUBLIC_LAUNCH?.trim() === "approved";
}

export class EmailNotVerifiedError extends Error {
  readonly code = "EMAIL_NOT_VERIFIED";
  constructor() {
    super("Verify your e-mail address first");
    this.name = "EmailNotVerifiedError";
  }
}

/** Throws unless the account's address is verified. It does nothing while verification is not required. */
export async function requireVerifiedEmail(userId: string, executor: DbExecutor = db, env: Record<string, string | undefined> = process.env) {
  if (!emailVerificationRequired(env)) return;
  const user = await executor.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
  if (!user?.emailVerifiedAt) throw new EmailNotVerifiedError();
}
