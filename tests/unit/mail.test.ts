import { afterEach, describe, expect, it, vi } from "vitest";
import { getEmailProvider, readMailConfiguration, ResendEmailProvider } from "@/services/mail/email-provider";
import { projectInvitationEmail, recoveryEmail, verificationEmail } from "@/services/mail/templates";

afterEach(() => vi.unstubAllGlobals());

describe("mail templates", () => {
  it("carries the code in Arabic and English, in the text and the html", () => {
    for (const message of [verificationEmail({ code: "123456", expiresInMinutes: 15 }), recoveryEmail({ code: "654321", expiresInMinutes: 15 })]) {
      expect(message.text).toMatch(/\d{6}/);
      expect(message.html).toMatch(/\d{6}/);
      expect(message.subject).toMatch(/[\u0600-\u06ff]/);
      expect(message.subject).toContain("Jenan PRO");
      expect(message.html).toContain("جنان برو");
      expect(message.html).toContain('dir="rtl"');
      expect(message.html).toContain('dir="ltr"');
    }
  });

  it("escapes what people typed and keeps it on one line in the subject and the body", () => {
    const message = projectInvitationEmail({
      inviterName: `Eve<script>alert(1)</script>\r\nBcc: attacker@example.test`,
      projectName: `"><img src=x onerror=alert(1)>\nSecond line`,
      role: "EDITOR",
    });
    expect(message.html).not.toContain("<script>");
    expect(message.html).not.toContain("<img");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.subject).not.toMatch(/[\r\n]/);
    expect(message.text).not.toMatch(/\r|Bcc: attacker@example.test\n/);
    expect(message.text).toContain("Second line");
  });

  it("falls back to a neutral inviter name and never links to a token", () => {
    const message = projectInvitationEmail({ inviterName: "  ", projectName: "Cold chain", role: "VIEWER" });
    expect(message.text).toContain("A Jenan PRO member");
    expect(message.html).not.toMatch(/href=/);
  });
});

describe("mail configuration", () => {
  it("lists what is missing without revealing a value", () => {
    const missing = readMailConfiguration({});
    expect(missing).toMatchObject({ configured: false, provider: null, fromDomain: null });
    expect(missing.problems.join(" ")).toContain("RESEND_API_KEY");
    expect(missing.problems.join(" ")).toContain("MAIL_FROM");
    expect(getEmailProvider({})).toBeNull();
  });

  it("reads the sender domain and accepts the older recovery setting", () => {
    const configuration = readMailConfiguration({ RESEND_API_KEY: "re_secret", MAIL_FROM: "Jenan PRO <no-reply@JenanPro.sa>" });
    expect(configuration).toEqual({ configured: true, fromDomain: "jenanpro.sa", problems: [], provider: "resend" });
    expect(readMailConfiguration({ RESEND_API_KEY: "re_secret", AUTH_RECOVERY_EMAIL_FROM: "access@example.test" }).configured).toBe(true);
    expect(JSON.stringify(configuration)).not.toContain("re_secret");
  });

  it("rejects a malformed sender or reply-to address", () => {
    expect(readMailConfiguration({ RESEND_API_KEY: "k", MAIL_FROM: "not an address" }).problems).toContain("MAIL_FROM is not a valid sender address");
    expect(readMailConfiguration({ RESEND_API_KEY: "k", MAIL_FROM: "a@b.sa", MAIL_REPLY_TO: "nope" }).problems).toContain("MAIL_REPLY_TO is not a valid address");
  });

  it("builds a provider only when everything is set", () => {
    expect(getEmailProvider({ RESEND_API_KEY: "k", MAIL_FROM: "a@b.sa" })?.name).toBe("resend");
    expect(getEmailProvider({ RESEND_API_KEY: "k" })).toBeNull();
  });
});

describe("Resend provider", () => {
  it("posts html, reply-to and an idempotency key, and returns the message id", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "msg-1" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", request);
    const provider = new ResendEmailProvider("key", "Jenan PRO <no-reply@jenanpro.sa>", "https://mail.example.test/send", "help@jenanpro.sa");

    await expect(provider.send({ html: "<p>Hi</p>", subject: "Subject", text: "Hi", to: "user@example.test", traceId: "trace-9" })).resolves.toEqual({ messageId: "msg-1" });
    const [url, init] = request.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://mail.example.test/send");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("trace-9");
    expect(JSON.parse(init.body as string)).toEqual({ from: "Jenan PRO <no-reply@jenanpro.sa>", subject: "Subject", text: "Hi", to: "user@example.test", html: "<p>Hi</p>", reply_to: "help@jenanpro.sa" });
  });

  it("fails without echoing the provider's answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("domain jenanpro.sa is not verified", { status: 403 })));
    const provider = new ResendEmailProvider("key", "a@b.sa");
    await expect(provider.send({ subject: "s", text: "t", to: "u@example.test", traceId: "x" })).rejects.toThrow("E-mail provider rejected the request (403)");
  });

  it("fails when the provider does not return a message id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const provider = new ResendEmailProvider("key", "a@b.sa");
    await expect(provider.send({ subject: "s", text: "t", to: "u@example.test", traceId: "x" })).rejects.toThrow("omitted the message id");
  });
});
