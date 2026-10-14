import type { EmailProvider } from "@/services/providers.contracts";

interface ResendEmailResponse {
  id?: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

/** Sends transactional e-mail through Resend (https://resend.com). */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly endpoint = "https://api.resend.com/emails",
    private readonly replyTo?: string,
  ) {}

  async send(input: { html?: string; replyTo?: string; subject: string; text: string; to: string; traceId: string }) {
    const replyTo = input.replyTo ?? this.replyTo;
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        // The provider drops a repeated request with the same key, so a retry never mails the person twice.
        "idempotency-key": input.traceId,
      },
      body: JSON.stringify({
        from: this.from,
        subject: input.subject,
        text: input.text,
        to: input.to,
        ...(input.html ? { html: input.html } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`E-mail provider rejected the request (${response.status})`);
    const payload = (await response.json()) as ResendEmailResponse;
    if (!payload.id) throw new Error("E-mail provider omitted the message id");
    return { messageId: payload.id };
  }
}

export interface MailConfiguration {
  /** Whether a provider can be built from the environment. */
  configured: boolean;
  /** The domain of the sender address; it must be verified with the provider (SPF and DKIM) before mail is delivered. */
  fromDomain: string | null;
  /** What is missing or malformed, in words an operator can act on. */
  problems: string[];
  provider: "resend" | null;
}

const ADDRESS = /^[^\s<>@]+@([^\s<>@]+\.[^\s<>@]+)$/;

function parseSender(value: string) {
  const match = /^(?:.+<)?\s*([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)\s*>?$/.exec(value);
  return match ? match[1] : null;
}

function senderOf(env: Record<string, string | undefined>) {
  // MAIL_FROM serves every message; the older recovery-only setting still works.
  return (env.MAIL_FROM ?? env.AUTH_RECOVERY_EMAIL_FROM)?.trim() ?? "";
}

export function readMailConfiguration(env: Record<string, string | undefined> = process.env): MailConfiguration {
  const apiKey = env.RESEND_API_KEY?.trim();
  const sender = senderOf(env);
  const problems: string[] = [];
  if (!apiKey) problems.push("RESEND_API_KEY is not set");
  if (!sender) problems.push("MAIL_FROM is not set (for example: Jenan PRO <no-reply@jenanpro.sa>)");
  const address = sender ? parseSender(sender) : null;
  if (sender && !address) problems.push("MAIL_FROM is not a valid sender address");
  const replyTo = env.MAIL_REPLY_TO?.trim();
  if (replyTo && !ADDRESS.test(replyTo)) problems.push("MAIL_REPLY_TO is not a valid address");
  const fromDomain = address ? (ADDRESS.exec(address)?.[1].toLowerCase() ?? null) : null;
  return { configured: problems.length === 0, fromDomain, problems, provider: problems.length === 0 ? "resend" : null };
}

/** The provider for this environment, or null when mail is not configured (nothing is sent and callers say so). */
export function getEmailProvider(env: Record<string, string | undefined> = process.env): EmailProvider | null {
  if (!readMailConfiguration(env).configured) return null;
  return new ResendEmailProvider(
    env.RESEND_API_KEY!.trim(),
    senderOf(env),
    env.AUTH_RECOVERY_EMAIL_ENDPOINT?.trim() || undefined,
    env.MAIL_REPLY_TO?.trim() || undefined,
  );
}
