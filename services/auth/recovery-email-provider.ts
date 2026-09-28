import type { EmailProvider } from "@/services/providers.contracts";

interface ResendEmailResponse {
  id?: string;
}

export class ResendRecoveryEmailProvider implements EmailProvider {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly endpoint = "https://api.resend.com/emails",
  ) {}

  async send(input: {
    subject: string;
    text: string;
    to: string;
    traceId: string;
  }) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.traceId,
      },
      body: JSON.stringify({
        from: this.from,
        subject: input.subject,
        text: input.text,
        to: input.to,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Recovery email provider rejected request (${response.status})`,
      );
    }
    const payload = (await response.json()) as ResendEmailResponse;
    if (!payload.id)
      throw new Error("Recovery email provider omitted message id");
    return { messageId: payload.id };
  }
}

export function getPasswordRecoveryEmailProvider(): EmailProvider | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_RECOVERY_EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return new ResendRecoveryEmailProvider(
    apiKey,
    from,
    process.env.AUTH_RECOVERY_EMAIL_ENDPOINT?.trim() || undefined,
  );
}
