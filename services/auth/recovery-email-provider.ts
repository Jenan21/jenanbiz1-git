import { getEmailProvider, ResendEmailProvider } from "@/services/mail/email-provider";
import type { EmailProvider } from "@/services/providers.contracts";

/** Kept for existing callers and tests; the provider now serves every transactional message. */
export const ResendRecoveryEmailProvider = ResendEmailProvider;

export function getPasswordRecoveryEmailProvider(): EmailProvider | null {
  return getEmailProvider();
}
