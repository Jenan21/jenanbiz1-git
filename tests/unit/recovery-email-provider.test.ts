import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPasswordRecoveryEmailProvider,
  ResendRecoveryEmailProvider,
} from "@/services/auth/recovery-email-provider";

describe("recovery email provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends a recovery message without exposing the API key", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "message-1" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", request);
    const provider = new ResendRecoveryEmailProvider(
      "secret-key",
      "Jenan Pro <access@example.test>",
      "https://mail.example.test/send",
    );

    await expect(
      provider.send({
        subject: "Recovery",
        text: "Code: 123456",
        to: "user@example.test",
        traceId: "trace-1",
      }),
    ).resolves.toEqual({ messageId: "message-1" });
    expect(request).toHaveBeenCalledWith(
      "https://mail.example.test/send",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer secret-key",
          "idempotency-key": "trace-1",
        }),
      }),
    );
  });

  it("stays unavailable until both production settings exist", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("AUTH_RECOVERY_EMAIL_FROM", "");
    expect(getPasswordRecoveryEmailProvider()).toBeNull();
  });
});
