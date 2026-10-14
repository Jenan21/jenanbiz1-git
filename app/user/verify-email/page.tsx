import { AuthWorkflowShell } from "@/components/auth/auth-workflow-shell";
import { EmailVerificationForm } from "@/components/auth/email-verification-form";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getEmailVerificationStatus } from "@/services/auth/email-verification-service";

export const dynamic = "force-dynamic";

/** Only a path inside this site is allowed as the place to continue to. */
function safeNext(value: string | undefined) {
  return value && /^\/(?![/\\])[^\s\u0000-\u001f]*$/.test(value) ? value : "/dashboard";
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ locale }, user, query] = await Promise.all([getRequestDictionary(), requireUser("/user/verify-email"), searchParams]);
  const status = await getEmailVerificationStatus(user.id);
  const ar = locale === "ar";
  return (
    <AuthWorkflowShell
      locale={locale}
      route="/user/verify-email"
      source="AUTHENTICATED_PROFILE"
      eyebrow={ar ? "تأكيد الحساب" : "ACCOUNT CHECK"}
      title={ar ? "تحقق من بريدك الإلكتروني" : "Verify your e-mail address"}
      description={
        ar
          ? "نرسل رمزاً من ستة أرقام إلى بريدك للتأكد من أنه بريدك. يلزم هذا لقبول الدعوات وللإجراءات الحساسة."
          : "We send a six-digit code to your address to confirm it is yours. It is needed to accept invitations and for sensitive actions."
      }
    >
      <EmailVerificationForm email={user.email} locale={locale} next={safeNext(query.next)} verified={status.verified} />
    </AuthWorkflowShell>
  );
}
