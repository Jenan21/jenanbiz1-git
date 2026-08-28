import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function LoginPage() {
  const { locale } = await getRequestDictionary();
  const ar = locale === "ar";
  return (
    <AuthShell
      locale={locale}
      languageLabel={ar ? "التبديل إلى الإنجليزية" : "Switch to Arabic"}
      eyebrow={ar ? "مرحبًا بعودتك" : "Welcome back"}
      title={ar ? "سجّل دخولك إلى مستقبل أعمالك" : "Sign in to your business future"}
      subtitle={
        ar
          ? "مساحة واحدة ذكية لإدارة أعمالك بثقة ووضوح."
          : "One intelligent space to run your business with confidence and clarity."
      }
      alternateText={ar ? "ليس لديك حساب؟" : "New to Jenan BIZ?"}
      alternateLabel={ar ? "أنشئ حسابًا" : "Create an account"}
      alternateHref="/register"
    >
      <AuthForm
        mode="login"
        locale={locale}
        labels={{
          name: "",
          countryCode: "",
          email: ar ? "البريد الإلكتروني" : "Email address",
          password: ar ? "كلمة المرور" : "Password",
          submit: ar ? "دخول آمن" : "Secure sign in",
          remember: ar ? "تذكرني" : "Remember me",
          forgot: ar ? "نسيت كلمة المرور؟" : "Forgot password?",
          loading: ar ? "جارٍ التحقق..." : "Verifying...",
          note: ar ? "اتصال مشفر وجلسة آمنة" : "Encrypted connection and secure session",
          errors: {
            INVALID_CREDENTIALS: ar
              ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
              : "Invalid email or password.",
            ACCOUNT_DISABLED: ar
              ? "الحساب غير متاح حاليًا."
              : "This account is currently unavailable.",
            VALIDATION_ERROR: ar
              ? "تحقق من البيانات المدخلة."
              : "Please check the entered information.",
            NETWORK: ar
              ? "تعذر الاتصال بالخادم."
              : "Could not connect to the server.",
            UNKNOWN: ar ? "تعذر تسجيل الدخول." : "Sign in failed.",
          },
        }}
      />
    </AuthShell>
  );
}
