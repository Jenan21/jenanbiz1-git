#!/usr/bin/env node
// Checks the e-mail setup that verification, password recovery and invitations depend on.
//
//   npm run mail:check                       validate the settings and, if the key allows it, the sender domain's DNS status
//   npm run mail:check -- --send you@x.com   also send one test message to that address
//
// Nothing secret is printed: the API key is never echoed, and the provider's raw answers are summarised.

const API = process.env.RESEND_API_ENDPOINT?.trim() || "https://api.resend.com";
const args = process.argv.slice(2);
const sendIndex = args.indexOf("--send");
const sendTo = sendIndex >= 0 ? args[sendIndex + 1] : undefined;

const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
const sender = (process.env.MAIL_FROM ?? process.env.AUTH_RECOVERY_EMAIL_FROM ?? "").trim();
const replyTo = process.env.MAIL_REPLY_TO?.trim() ?? "";

const ok = (message) => console.log(`  [ok]   ${message}`);
const warn = (message) => console.log(`  [warn] ${message}`);
const fail = (message) => console.log(`  [FAIL] ${message}`);

let failures = 0;
const problem = (message) => {
  failures += 1;
  fail(message);
};

const address = /^(?:.+<)?\s*([^\s<>@]+@([^\s<>@]+\.[^\s<>@]+))\s*>?$/.exec(sender);
const fromDomain = address?.[2]?.toLowerCase() ?? null;

console.log("Mail settings");
if (apiKey) ok(`RESEND_API_KEY is set (${apiKey.startsWith("re_") ? "looks like a Resend key" : "unexpected format, Resend keys start with re_"})`);
else problem("RESEND_API_KEY is not set");
if (!sender) problem("MAIL_FROM is not set (for example: Jenan PRO <no-reply@jenanpro.sa>)");
else if (!address) problem("MAIL_FROM is not a valid sender address");
else ok(`MAIL_FROM sends as ${address[1]}`);
if (replyTo) {
  if (/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(replyTo)) ok(`MAIL_REPLY_TO is ${replyTo}`);
  else problem("MAIL_REPLY_TO is not a valid address");
}
if (fromDomain && fromDomain !== "jenanpro.sa" && !fromDomain.endsWith(".jenanpro.sa")) {
  warn(`the sender domain is ${fromDomain}, not jenanpro.sa; recipients may distrust the messages`);
}

async function call(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

if (apiKey && fromDomain) {
  console.log("\nSender domain at Resend");
  try {
    const list = await call("/domains");
    if (list.status === 401 || list.status === 403) {
      warn("this key can only send mail, so the domain status cannot be read; open Resend > Domains to confirm it is verified");
    } else if (list.status !== 200) {
      problem(`Resend answered ${list.status} when listing domains`);
    } else {
      const domain = (list.payload?.data ?? []).find((item) => item.name?.toLowerCase() === fromDomain);
      if (!domain) {
        problem(`${fromDomain} is not added in Resend yet (Resend > Domains > Add domain)`);
      } else {
        const detail = await call(`/domains/${encodeURIComponent(domain.id)}`);
        const records = detail.payload?.records ?? [];
        if (domain.status === "verified") ok(`${fromDomain} is verified (region ${domain.region ?? "unknown"})`);
        else problem(`${fromDomain} is ${domain.status}; add the DNS records below at the registrar and press Verify in Resend`);
        for (const record of records) {
          const state = record.status === "verified" ? "ok" : record.status;
          console.log(`         ${String(record.record ?? "").padEnd(5)} ${String(record.type ?? "").padEnd(5)} ${record.name}  ->  ${record.value}  [${state}]`);
        }
      }
    }
  } catch (error) {
    warn(`could not reach Resend: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

if (sendTo) {
  console.log("\nTest message");
  if (failures) {
    problem("not sending: fix the problems above first");
  } else if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sendTo)) {
    problem("--send needs an e-mail address");
  } else {
    try {
      const result = await call("/emails", {
        method: "POST",
        headers: { "idempotency-key": `mail-check-${Date.now()}` },
        body: JSON.stringify({
          from: sender,
          to: sendTo,
          subject: "Jenan PRO mail check · فحص البريد",
          text: "This is a test message from Jenan PRO. If you can read it, e-mail delivery works.\nهذه رسالة اختبار من جنان برو. إن وصلتك فالبريد يعمل.",
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });
      if (result.status === 200 && result.payload?.id) ok(`sent (message id ${result.payload.id}); check the inbox and the spam folder`);
      else problem(`Resend answered ${result.status}${result.payload?.message ? `: ${String(result.payload.message).slice(0, 200)}` : ""}`);
    } catch (error) {
      problem(`could not reach Resend: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
}

console.log(failures ? `\n${failures} problem(s) found.` : "\nMail is ready.");
process.exit(failures ? 1 : 0);
