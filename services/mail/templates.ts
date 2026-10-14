export interface MailMessage {
  html: string;
  subject: string;
  text: string;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Names typed by people end up in a subject line and a body; line breaks would let them add headers or paragraphs. */
const singleLine = (value: string, limit = 120) => value.replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);

interface Section {
  ar: { heading: string; lines: string[] };
  en: { heading: string; lines: string[] };
  /** A figure the reader has to copy, such as the six-digit code. */
  highlight?: string;
}

function render(subject: string, section: Section, footer: { ar: string; en: string }): MailMessage {
  const text = [
    section.en.heading,
    ...section.en.lines,
    ...(section.highlight ? ["", `    ${section.highlight}`, ""] : []),
    "",
    section.ar.heading,
    ...section.ar.lines,
    ...(section.highlight ? ["", `    ${section.highlight}`, ""] : []),
    "",
    footer.en,
    footer.ar,
  ].join("\n");

  const block = (direction: "ltr" | "rtl", content: Section["en"], align: "left" | "right") =>
    `<div dir="${direction}" style="text-align:${align};font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#0b2530;line-height:1.7">` +
    `<h2 style="margin:0 0 8px;font-size:18px;color:#06586b">${escapeHtml(content.heading)}</h2>` +
    content.lines.map((line) => `<p style="margin:0 0 8px;font-size:15px">${escapeHtml(line)}</p>`).join("") +
    `</div>`;
  const highlight = section.highlight
    ? `<p dir="ltr" style="margin:16px 0;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#06586b">${escapeHtml(section.highlight)}</p>`
    : "";
  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f2f7f9">` +
    `<div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #d3e4ea;border-radius:12px">` +
    `<p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#06586b">Jenan PRO &middot; جنان برو</p>` +
    block("ltr", section.en, "left") +
    highlight +
    `<hr style="border:0;border-top:1px solid #d3e4ea;margin:16px 0">` +
    block("rtl", section.ar, "right") +
    `<p style="margin:16px 0 0;font-size:12px;color:#5d7782">${escapeHtml(footer.en)}<br>${escapeHtml(footer.ar)}</p>` +
    `</div></body></html>`;
  return { html, subject, text };
}

const ignoreFooter = {
  ar: "إن لم تطلب هذه الرسالة فتجاهلها، ولن يتغير شيء في حسابك.",
  en: "If you did not ask for this message, ignore it; nothing changes on your account.",
};

export function verificationEmail(input: { code: string; expiresInMinutes: number }): MailMessage {
  return render(
    "Jenan PRO verification code · رمز التحقق من جنان برو",
    {
      en: { heading: "Verify your e-mail address", lines: [`Enter this code in Jenan PRO. It expires in ${input.expiresInMinutes} minutes.`] },
      ar: { heading: "تحقق من بريدك الإلكتروني", lines: [`أدخل هذا الرمز في جنان برو. ينتهي خلال ${input.expiresInMinutes} دقيقة.`] },
      highlight: input.code,
    },
    ignoreFooter,
  );
}

export function recoveryEmail(input: { code: string; expiresInMinutes: number }): MailMessage {
  return render(
    "Jenan PRO password recovery code · رمز استعادة كلمة المرور",
    {
      en: { heading: "Reset your password", lines: [`Use this code to choose a new password. It expires in ${input.expiresInMinutes} minutes.`] },
      ar: { heading: "استعادة كلمة المرور", lines: [`استخدم هذا الرمز لاختيار كلمة مرور جديدة. ينتهي خلال ${input.expiresInMinutes} دقائق.`] },
      highlight: input.code,
    },
    ignoreFooter,
  );
}

export function projectInvitationEmail(input: { inviterName: string; projectName: string; role: string }): MailMessage {
  const inviter = singleLine(input.inviterName, 80) || "A Jenan PRO member";
  const project = singleLine(input.projectName, 120);
  return render(
    "You are invited to a Jenan PRO project · دعوة إلى مشروع في جنان برو",
    {
      en: {
        heading: "You have been invited to a project",
        lines: [
          `${inviter} invited you to join "${project}" as ${input.role.toLowerCase()}.`,
          "Sign in to Jenan PRO with this e-mail address, verify it if asked, and open Projects to accept or decline.",
        ],
      },
      ar: {
        heading: "تمت دعوتك إلى مشروع",
        lines: [
          `دعاك ${inviter} للانضمام إلى «${project}» بدور ${input.role}.`,
          "سجّل الدخول إلى جنان برو بهذا البريد، وأكّد البريد إن طُلب منك، ثم افتح المشاريع لقبول الدعوة أو رفضها.",
        ],
      },
    },
    ignoreFooter,
  );
}
