# E-mail setup (Resend)

Jenan PRO sends three kinds of e-mail: e-mail verification codes, password-recovery codes and project invitations.
All of them go through one provider, [Resend](https://resend.com). Until it is configured nothing is sent: the product
says so honestly (the verification page offers no code in production, recovery answers as if the address were unknown,
and an invitation is saved and waits for the person to sign in).

## 1. What you need

| Item | Where it comes from |
| --- | --- |
| A Resend account | resend.com (free plan has daily and monthly caps; check the current limits before the trial group) |
| The domain `jenanpro.sa` added in Resend | Resend > Domains > Add domain |
| DNS records from Resend | Added at the domain registrar (`t2.sa`) |
| An API key with "Sending access" for that domain | Resend > API Keys |

## 2. Add the domain and its DNS records

1. Resend > Domains > **Add domain** > `jenanpro.sa`.
2. Resend shows the exact records. They are normally an SPF `TXT` and an `MX` on a `send` sub-domain, and a DKIM `TXT` named
   `resend._domainkey`. Copy them exactly as shown; do not edit the root domain's own web records (`A @`, `CNAME www`).
3. Add them at the registrar and press **Verify** in Resend. DNS can take minutes to hours.
4. Recommended once it is verified: a DMARC record, for example `_dmarc` `TXT` `v=DMARC1; p=none; rua=mailto:you@jenanpro.sa`,
   then tighten `p=` after a few weeks of clean reports.

## 3. Set the variables

In Vercel (Project `jenan-pro-private` > Settings > Environment Variables, **Production**), or with the CLI
(`vercel env add NAME production`):

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | the key from step 1 (mark it Sensitive) |
| `MAIL_FROM` | `Jenan PRO <no-reply@jenanpro.sa>` |
| `MAIL_REPLY_TO` | optional, an inbox a person reads |
| `REQUIRE_EMAIL_VERIFICATION` | `true` for the invited trial group; leave empty to follow `PUBLIC_LAUNCH` |

Redeploy afterwards so the new values apply. The older `AUTH_RECOVERY_EMAIL_FROM` still works when `MAIL_FROM` is empty.

## 4. Check it

Locally, with the same values in `.env` (never commit that file):

```bash
npm run mail:check                        # validates the settings and reads the domain's DNS status from Resend
npm run mail:check -- --send you@x.com    # also sends one real test message
```

The report never prints the key. A key limited to "Sending access" cannot read the domain list; the script says so and
you confirm the domain status in the Resend dashboard instead.

## 5. What depends on it

* **Email verification**: `/user/verify-email` mails a six-digit code (15 minutes, five guesses, one code a minute, five an
  hour). Verified addresses unlock accepting invitations, inviting people, publishing listings and job postings, and paying
  for campaigns whenever verification is required (`REQUIRE_EMAIL_VERIFICATION=true`, or after `PUBLIC_LAUNCH=approved`).
* **Password recovery**: unchanged behaviour, now sent through the same provider with a bilingual template.
* **Project invitations**: the owner invites an address; the person signs in with it, verifies it, and accepts or declines
  under Projects. The mail contains no link or token: access is granted only by an explicit accept from the matching,
  verified account.

## 6. Troubleshooting

| Symptom | Cause |
| --- | --- |
| `mail:check` says the domain is not added or not verified | DNS records missing or not propagated; press Verify again later |
| Resend answers 403 | the key cannot send for this domain, or the `MAIL_FROM` domain differs from the verified one |
| Codes arrive in spam | DMARC missing, or the domain was verified minutes ago; give it time and keep `MAIL_FROM` on `jenanpro.sa` |
| The verification page shows "unavailable" | `RESEND_API_KEY` or `MAIL_FROM` is not set in the **Production** environment |
| Verification page shows a code on screen | only happens outside production when nothing is configured; it never happens on `jenanpro.sa` |
