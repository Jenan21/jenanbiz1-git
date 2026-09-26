import { redirect } from "next/navigation";
import { AuthWorkflowShell } from "@/components/auth/auth-workflow-shell";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function OnboardingPage() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/user/onboarding")]);
  if (user.profile?.onboardedAt) redirect("/dashboard");
  const ar = locale === "ar";
  return (
    <AuthWorkflowShell
      locale={locale}
      eyebrow={ar ? "الخطوة الأخيرة" : "FINAL SETUP"}
      title={ar ? "هيّئ حسابك" : "Set up your account"}
      description={ar ? "حدد نوع الحساب وموقعك واهتماماتك لنرتب مساحة العمل حسب أولوياتك." : "Choose your account type, location, and interests so the workspace reflects your priorities."}
    >
      <OnboardingForm initialCountryCode={user.profile?.countryCode ?? "SA"} locale={locale} />
    </AuthWorkflowShell>
  );
}