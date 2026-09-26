import { AuthWorkflowShell } from "@/components/auth/auth-workflow-shell";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function ForgotPasswordPage() {
  const { locale } = await getRequestDictionary();
  const ar = locale === "ar";
  return (
    <AuthWorkflowShell
      locale={locale}
      eyebrow={ar ? "استعادة آمنة" : "SECURE RECOVERY"}
      title={ar ? "استعادة كلمة المرور" : "Recover your password"}
      description={ar ? "تحقق من هويتك ثم أنشئ كلمة مرور جديدة. لا نكشف وجود الحساب في بيئة الإنتاج." : "Verify your identity, then create a new password. Account existence is never disclosed in production."}
    >
      <PasswordRecoveryForm locale={locale} />
    </AuthWorkflowShell>
  );
}